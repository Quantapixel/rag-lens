/**
 * Text extraction for uploaded files.
 *
 * Text formats are read directly. PDF and DOCX need real parsers, so both are
 * pulled in with a dynamic `import()` — Vite splits them into their own chunks
 * and you only download the parser for the kind of file you actually drop in.
 * Nothing here loads until the first upload.
 */

export interface ExtractResult {
  text: string
  /** Page count, when the format tells us (PDF). */
  pages?: number
}

const PLAIN_TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.tsv']

export type FileKind = 'text' | 'pdf' | 'docx' | 'unsupported'

/** Which parser a file needs, based on extension then MIME type. */
export function fileKind(file: File): FileKind {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) return 'docx'
  if (PLAIN_TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'text'
  if (file.type.startsWith('text/')) return 'text'
  return 'unsupported'
}

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', ...PLAIN_TEXT_EXTENSIONS]

// ─── DOCX ─────────────────────────────────────────────────────────────────────

/**
 * Turn one OOXML part into plain text.
 *
 * A .docx is a zip of XML. The readable prose lives in `<w:t>` runs grouped by
 * paragraphs, so: mark the boundaries, drop every tag, then decode entities.
 */
function ooxmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    // &amp; last, or "&amp;lt;" would decode twice into "<".
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Parts of the package that contain prose, in reading order. */
const DOCX_TEXT_PARTS =
  /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/

async function extractDocx(file: File): Promise<ExtractResult> {
  const { unzipSync } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const decoder = new TextDecoder()

  const names = Object.keys(zip)
    .filter((n) => DOCX_TEXT_PARTS.test(n))
    // document.xml first; headers and footers after.
    .sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b)))

  if (names.length === 0) {
    throw new Error('no readable text — is this a .docx file?')
  }

  const text = names
    .map((n) => ooxmlToText(decoder.decode(zip[n])))
    .filter(Boolean)
    .join('\n\n')

  return { text }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function extractPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist')
  // The worker must be loaded from a URL, not bundled into the main chunk —
  // otherwise parsing blocks the UI thread.
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  })
  const doc = await loadingTask.promise

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '))
    page.cleanup()
  }

  const pageCount = doc.numPages
  // Teardown lives on the loading task in pdf.js v6, not the document proxy.
  await loadingTask.destroy()

  // Re-join hyphenated line breaks, then normalise whitespace.
  const text = pages
    .join('\n\n')
    .replace(/(\w)-\s+(\w)/g, '$1$2')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { text, pages: pageCount }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function extractText(file: File): Promise<ExtractResult> {
  switch (fileKind(file)) {
    case 'text':
      return { text: await file.text() }
    case 'pdf':
      return extractPdf(file)
    case 'docx':
      return extractDocx(file)
    default:
      throw new Error('unsupported format')
  }
}
