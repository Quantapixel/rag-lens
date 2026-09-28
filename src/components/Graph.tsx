/**
 * Graph — canvas-based document relationship visualiser.
 *
 * The layout runs a small force-directed simulation each frame:
 *   • Coulomb-style repulsion pushes every pair of nodes apart
 *   • Hookean springs along each edge pull connected nodes together
 *   • a weak centering force keeps the whole cloud in frame
 *   • velocity damping lets it settle into a calm, stable layout
 *
 * Drag model:
 *   • mousedown / touchstart on a node  → begin drag, capture that node
 *   • mousemove / touchmove             → update the node's position in nodePositions ref
 *   • mouseup / touchend                → end drag
 *   • click (no movement)               → select / deselect the node
 *
 * Node positions live in a ref (not state) so the rAF draw loop can read
 * them on every frame without triggering React re-renders. The draw loop
 * effect only re-runs when dims / docs / connections / activeDocId change.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { Document, Connection } from '../types'
import { EDGE_STYLES, EDGE_COLOR } from './ui'

// ─── Simulation tuning ────────────────────────────────────────────────────────

const REPULSION  = 4200   // pairwise repulsion strength
const SPRING     = 0.01   // edge spring stiffness
const SPRING_LEN = 190    // resting edge length, shrunk on small canvases
const CENTER     = 0.0028 // pull toward canvas centre
const DAMPING    = 0.86   // velocity decay per frame
const MAX_SPEED  = 16     // velocity clamp so the cloud never explodes

// ─── Initial layout ───────────────────────────────────────────────────────────

// Fractional (0-1) initial positions for the mock documents.
// Any doc id not listed here gets a radial fallback position.
const INITIAL_POSITIONS: Record<string, { x: number; y: number }> = {
  'doc-1': { x: 0.5,  y: 0.48 },
  'doc-2': { x: 0.22, y: 0.25 },
  'doc-3': { x: 0.76, y: 0.68 },
  'doc-4': { x: 0.72, y: 0.24 },
  'doc-5': { x: 0.2,  y: 0.72 },
}

function radialPosition(index: number, total: number): { x: number; y: number } {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return {
    x: 0.5 + 0.35 * Math.cos(angle),
    y: 0.5 + 0.35 * Math.sin(angle),
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeState {
  id: string
  // Absolute pixel positions — mutated directly by the drag handler
  x: number
  y: number
  // Velocities — integrated by the force simulation
  vx: number
  vy: number
  r: number
  color: string
  name: string
  status: Document['status']
}

interface DragState {
  nodeId: string
  // Offset from the node centre to where the user first clicked
  offsetX: number
  offsetY: number
  // Track whether the pointer moved enough to count as a drag vs a click
  hasMoved: boolean
}

interface GraphProps {
  docs: Document[]
  connections: Connection[]
  activeDocId: string | null
  onSelectDoc: (id: string | null) => void
  /** Document ids pulled back by the latest query — drawn with a reticle */
  highlightIds?: string[]
}

// ─── Physics ──────────────────────────────────────────────────────────────────

/**
 * Advance every node by one simulation tick. Pure with respect to React —
 * it mutates the node objects in place, which is what lets the rAF loop run
 * without triggering re-renders. Also run in a loop to pre-settle the layout.
 */
function simulateStep(
  nodes: NodeState[],
  connections: Connection[],
  w: number,
  h: number,
  draggedId?: string,
) {
  const cx = w / 2
  const cy = h / 2
  // On short canvases (e.g. when the trace panel is open) pull the edges in
  // so the cloud stays comfortably in frame.
  const restLen = Math.min(SPRING_LEN, Math.max(150, Math.min(w, h) * 0.42))

  // Weak centering force
  for (const n of nodes) {
    if (n.id === draggedId) continue
    n.vx += (cx - n.x) * CENTER
    n.vy += (cy - n.y) * CENTER
  }

  // Pairwise repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      let dx = a.x - b.x
      let dy = a.y - b.y
      let d2 = dx * dx + dy * dy
      if (d2 < 1600) {
        // Too close (or coincident) — nudge apart so the direction is defined
        dx += (Math.random() - 0.5) * 2
        dy += (Math.random() - 0.5) * 2
        d2 = 1600
      }
      const d = Math.sqrt(d2)
      const f = REPULSION / d2
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
  }

  // Edge springs
  for (const c of connections) {
    const a = nodes.find((n) => n.id === c.from)
    const b = nodes.find((n) => n.id === c.to)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.hypot(dx, dy) || 1
    const f = (d - restLen) * SPRING
    const fx = (dx / d) * f
    const fy = (dy / d) * f
    a.vx += fx; a.vy += fy
    b.vx -= fx; b.vy -= fy
  }

  // Integrate velocities → positions
  for (const n of nodes) {
    if (n.id === draggedId) { n.vx = 0; n.vy = 0; continue }
    n.vx *= DAMPING
    n.vy *= DAMPING
    const speed = Math.hypot(n.vx, n.vy)
    if (speed > MAX_SPEED) {
      n.vx = (n.vx / speed) * MAX_SPEED
      n.vy = (n.vy / speed) * MAX_SPEED
    }
    // Bounds leave room for the label that sits beneath each node.
        const minX = n.r + 58
        const maxX = w - n.r - 58
        const minY = n.r + 10
        const maxY = h - n.r - 26
    n.x = Math.max(Math.min(minX, maxX), Math.min(maxX, n.x + n.vx))
    n.y = Math.max(Math.min(minY, maxY), Math.min(maxY, n.y + n.vy))
  }

  // Hard centre: translate the whole cloud so its centroid sits exactly at the
  // canvas centre. Force-based centring alone converges too slowly to look
  // right during the settle animation, so we pin the centroid every tick.
  // Skipped while dragging so the dragged node leads the motion naturally.
  if (!draggedId && nodes.length > 0) {
    let sx = 0
    let sy = 0
    for (const n of nodes) { sx += n.x; sy += n.y }
    const dx = cx - sx / nodes.length
    const dy = cy - sy / nodes.length
    if (dx !== 0 || dy !== 0) {
      for (const n of nodes) { n.x += dx; n.y += dy }
    }
  }
}

/**
 * Translate the settled cloud so its centroid sits at the canvas centre, then
 * scale it down if any node would fall outside the padded safe area. Run once
 * after a layout change so node labels are always fully visible.
 */
function centerAndFit(nodes: NodeState[], w: number, h: number) {
  if (nodes.length === 0) return
  const cx = w / 2
  const cy = h / 2

  // 1. Centre the cloud on its centroid
  let sx = 0
  let sy = 0
  for (const n of nodes) { sx += n.x; sy += n.y }
  const shiftX = cx - sx / nodes.length
  const shiftY = cy - sy / nodes.length
  for (const n of nodes) {
    n.x += shiftX
    n.y += shiftY
    n.vx = 0
    n.vy = 0
  }

  // 2. Shrink uniformly if the cloud overflows the padded safe area
  const safeX = w / 2 - 80
  const safeY = h / 2 - 44
  if (safeX <= 0 || safeY <= 0) return
  let extent = 0
  for (const n of nodes) {
    extent = Math.max(
      extent,
      Math.abs(n.x - cx) / safeX,
      Math.abs(n.y - cy) / safeY,
    )
  }
  if (extent > 1) {
    const s = 1 / extent
    for (const n of nodes) {
      n.x = cx + (n.x - cx) * s
      n.y = cy + (n.y - cy) * s
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Graph({
  docs,
  connections,
  activeDocId,
  onSelectDoc,
  highlightIds = [],
}: GraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const dimsRef = useRef({ w: 0, h: 0 })

  // Stable lookup for the highlight set — avoids rebuilding it every frame.
  const highlightKey = highlightIds.join('|')
  const highlightSet = useMemo(() => new Set(highlightIds), [highlightKey])

  // Mutable node positions — the draw loop reads these every frame
  const nodesRef = useRef<NodeState[]>([])

  // Current drag in progress, or null
  const dragRef = useRef<DragState | null>(null)

  const rafRef = useRef(0)

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      dimsRef.current = { w, h }
      setDims({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Sync node list when docs or dims change ────────────────────────────────
  // Preserve existing positions for nodes already in the list so that
  // dragged positions survive re-renders.
  useEffect(() => {
    const { w, h } = dimsRef.current
    if (w === 0 || h === 0) return

    const existing = new Map(nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y }]))

    let createdAny = false
    nodesRef.current = docs.map((doc, i) => {
      if (existing.has(doc.id)) {
        // Preserve the dragged position
        const pos = existing.get(doc.id)!
        return {
          id: doc.id,
          x: pos.x,
          y: pos.y,
          vx: 0,
          vy: 0,
          r: doc.status === 'indexed' ? 20 : 13,
          color: doc.color,
          name: doc.name,
          status: doc.status,
        }
      }
      // New node — compute initial position from the lookup table or radial fallback
      createdAny = true
      const frac = INITIAL_POSITIONS[doc.id] ?? radialPosition(i, docs.length)
      return {
        id: doc.id,
        x: frac.x * w,
        y: frac.y * h,
        vx: 0,
        vy: 0,
        r: doc.status === 'indexed' ? 20 : 13,
        color: doc.color,
        name: doc.name,
        status: doc.status,
      }
    })

    // Pre-settle new layouts so the first paint is already well arranged,
    // rather than depending on how many animation frames have elapsed.
    if (createdAny) {
      for (let i = 0; i < 320; i++) {
        simulateStep(nodesRef.current, connections, w, h)
      }
    }
    // Always re-centre after a layout/resize so labels stay in frame.
    centerAndFit(nodesRef.current, w, h)
  }, [docs, dims, connections])

  // ── Draw loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio
    const ctx = canvas.getContext('2d')!

    // The canvas is authoritative about its own size: every frame we re-read
    // the element box and resize the backing store if it drifted from our
    // cached dimensions. This keeps the drawing surface correct even when a
    // ResizeObserver callback lags behind a layout change.
    let view = { w: 0, h: 0 }
    const syncSize = (): boolean => {
      const el = canvas.parentElement
      if (!el) return false
      const w = el.clientWidth
      const h = el.clientHeight
      if (w === 0 || h === 0) return false
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }
      // Setting width/height resets context state, so re-apply the scale.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      view = { w, h }
      // Notify React (init/settle effect) only when the size really changed.
      if (dimsRef.current.w !== w || dimsRef.current.h !== h) {
        dimsRef.current = { w, h }
        setDims({ w, h })
      }
      return true
    }

    // ── One simulation tick ──────────────────────────────────────────────
    const simulate = () => {
      simulateStep(nodesRef.current, connections, view.w, view.h, dragRef.current?.nodeId)
    }

    // ── Faint dot-grid backdrop ──────────────────────────────────────────
    const drawGrid = () => {
      const spacing = 26
      ctx.fillStyle = '#161619'
      for (let x = spacing / 2; x < view.w; x += spacing) {
        for (let y = spacing / 2; y < view.h; y += spacing) {
          ctx.beginPath()
          ctx.arc(x, y, 0.9, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const draw = (ts: number) => {
      if (!syncSize()) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }
      const nodes = nodesRef.current
      ctx.clearRect(0, 0, view.w, view.h)

      drawGrid()
      simulate()

      // ── Edges ────────────────────────────────────────────────────────
      connections.forEach((c) => {
        const nodeA = nodes.find((n) => n.id === c.from)
        const nodeB = nodes.find((n) => n.id === c.to)
        if (!nodeA || !nodeB) return

        const isActive = c.from === activeDocId || c.to === activeDocId
        const isRetrieved =
          highlightSet.has(c.from) && highlightSet.has(c.to)
        const style = EDGE_STYLES[c.type]
        const lit = isActive || isRetrieved
        // Idle edges recede to a faint hairline; lit edges step forward.
        const alpha = Math.min(1, (lit ? 0.78 : 0.17) * style.weight)

        ctx.strokeStyle = `rgba(${EDGE_COLOR}, ${alpha})`
        ctx.lineWidth   = (lit ? 1.3 : 1) * Math.min(1.2, style.weight)
        ctx.setLineDash(style.dash)
        ctx.beginPath()
        ctx.moveTo(nodeA.x, nodeA.y)
        ctx.lineTo(nodeB.x, nodeB.y)
        ctx.stroke()
        ctx.setLineDash([])

        // Animated bead on active edges
        if (lit) {
          const t = (ts / 1600) % 1
          ctx.fillStyle = 'rgba(250, 250, 250, 0.85)'
          ctx.beginPath()
          ctx.arc(
            nodeA.x + (nodeB.x - nodeA.x) * t,
            nodeA.y + (nodeB.y - nodeA.y) * t,
            2.2, 0, Math.PI * 2,
          )
          ctx.fill()
        }

        // Strength label at edge midpoint
        const midX = (nodeA.x + nodeB.x) / 2
        const midY = (nodeA.y + nodeB.y) / 2
        ctx.fillStyle = lit ? 'rgba(244, 244, 245, 0.72)' : 'rgba(113, 113, 122, 0.30)'
        ctx.font      = '10px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${Math.round(c.strength * 100)}%`, midX, midY - 5)
      })

      // ── Nodes ────────────────────────────────────────────────────────
      nodes.forEach((n) => {
        const isActive    = n.id === activeDocId
        const isRetrieved = highlightSet.has(n.id)
        const isDragged   = dragRef.current?.nodeId === n.id
        const lit         = isActive || isRetrieved || isDragged
        const pulse       = isActive && !isDragged ? Math.sin(ts / 700) * 2.5 : 0

        // Retrieval reticle — a slow rotating dashed ring around cited docs
        if (isRetrieved) {
          const rr = n.r + 8 + Math.sin(ts / 500) * 1.5
          ctx.save()
          ctx.translate(n.x, n.y)
          ctx.rotate(ts / 4000)
          ctx.strokeStyle = 'rgba(250, 250, 250, 0.5)'
          ctx.lineWidth = 1
          ctx.setLineDash([3, 5])
          ctx.beginPath()
          ctx.arc(0, 0, rr, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Soft neutral halo — only for lit nodes, so idle nodes stay flat
        if (lit) {
          const grd = ctx.createRadialGradient(
            n.x, n.y, 0, n.x, n.y, n.r * 3 + pulse,
          )
          grd.addColorStop(0, isActive ? 'rgba(250,250,250,0.16)' : 'rgba(250,250,250,0.09)')
          grd.addColorStop(1, 'transparent')
          ctx.fillStyle = grd
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * 3 + pulse, 0, Math.PI * 2)
          ctx.fill()
        }

        // Ring — tonal ramp for idle, near-white for lit
        ctx.strokeStyle = isActive ? '#fafafa' : lit ? 'rgba(244,244,245,0.75)' : n.color + '73'
        ctx.lineWidth = isDragged ? 2 : isActive ? 1.6 : 1
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.stroke()

        // Fill
        ctx.fillStyle = isActive || isDragged
          ? 'rgba(250, 250, 250, 0.07)'
          : isRetrieved ? 'rgba(250, 250, 250, 0.04)' : '#0e0e11'
        ctx.fill()

        // Centre dot
        ctx.fillStyle = lit ? '#fafafa' : n.color + 'a6'
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r * 0.3, 0, Math.PI * 2)
        ctx.fill()

        // Label — queued (not-yet-indexed) docs stay unlabelled to reduce
        // clutter, unless they're selected, dragged or part of a citation.
        const showLabel =
          isActive || isDragged || isRetrieved || n.status !== 'queued'
        if (showLabel) {
          ctx.fillStyle = isActive ? '#fafafa' : isRetrieved ? '#d4d4d8' : '#7c7c85'
          ctx.font      = `${isActive ? '500' : '400'} 11px Inter, sans-serif`
          ctx.textAlign = 'center'
          const label = n.name.length > 18 ? n.name.slice(0, 18) + '…' : n.name
          ctx.fillText(label, n.x, n.y + n.r + 16)
        }
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [dims, connections, activeDocId, highlightSet])
  // Note: docs is intentionally omitted — node data lives in nodesRef

  // ── Hit test helper ────────────────────────────────────────────────────────
  const hitTest = useCallback((clientX: number, clientY: number): NodeState | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    // Iterate in reverse so nodes drawn on top (last) are hit first
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i]
      if (Math.hypot(mx - n.x, my - n.y) <= n.r + 10) return n
    }
    return null
  }, [])

  // ── Pointer events (mouse) ─────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const node = hitTest(e.clientX, e.clientY)
    if (!node) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      nodeId: node.id,
      offsetX: e.clientX - rect.left - node.x,
      offsetY: e.clientY - rect.top  - node.y,
      hasMoved: false,
    }
    e.currentTarget.style.cursor = 'grabbing'
  }, [hitTest])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      const rect  = e.currentTarget.getBoundingClientRect()
      const newX  = e.clientX - rect.left - dragRef.current.offsetX
      const newY  = e.clientY - rect.top  - dragRef.current.offsetY
      const node  = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId)
      if (node) {
        // Clamp to canvas bounds (with label room) so nodes aren't lost off-screen
        const { w, h } = dimsRef.current
        node.x = Math.max(node.r + 54, Math.min(w - node.r - 54, newX))
        node.y = Math.max(node.r + 10, Math.min(h - node.r - 30, newY))
        dragRef.current.hasMoved = true
      }
      e.currentTarget.style.cursor = 'grabbing'
    } else {
      e.currentTarget.style.cursor = hitTest(e.clientX, e.clientY) ? 'grab' : 'default'
    }
  }, [hitTest, dims])

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    e.currentTarget.style.cursor = hitTest(e.clientX, e.clientY) ? 'grab' : 'default'

    // Only fire selection if the pointer didn't move (i.e. it was a click, not a drag)
    if (drag && !drag.hasMoved) {
      onSelectDoc(drag.nodeId === activeDocId ? null : drag.nodeId)
    }
  }, [hitTest, activeDocId, onSelectDoc])

  // Cancel drag if mouse leaves the canvas
  const onMouseLeave = useCallback(() => {
    dragRef.current = null
  }, [])

  // ── Touch events ───────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0]
    const node  = hitTest(touch.clientX, touch.clientY)
    if (!node) return
    e.preventDefault() // prevent scroll while dragging a node
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      nodeId: node.id,
      offsetX: touch.clientX - rect.left - node.x,
      offsetY: touch.clientY - rect.top  - node.y,
      hasMoved: false,
    }
  }, [hitTest])

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return
    e.preventDefault()
    const touch = e.touches[0]
    const rect  = e.currentTarget.getBoundingClientRect()
    const newX  = touch.clientX - rect.left - dragRef.current.offsetX
    const newY  = touch.clientY - rect.top  - dragRef.current.offsetY
    const node  = nodesRef.current.find((n) => n.id === dragRef.current!.nodeId)
    if (node) {
      const { w, h } = dimsRef.current
      node.x = Math.max(node.r + 54, Math.min(w - node.r - 54, newX))
      node.y = Math.max(node.r + 10, Math.min(h - node.r - 30, newY))
      dragRef.current.hasMoved = true
    }
  }, [dims])

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && !drag.hasMoved) {
      onSelectDoc(drag.nodeId === activeDocId ? null : drag.nodeId)
    }
  }, [activeDocId, onSelectDoc])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', touchAction: 'none' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    />
  )
}
