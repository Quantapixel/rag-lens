# RAG Lens

**See inside your AI's knowledge.**

RAG Lens is an observability surface for retrieval-augmented generation (RAG).
Most RAG apps hand you an answer and hope you trust it. RAG Lens shows you the
*why*: it maps your document corpus as a live relationship graph and traces
every question through the retrieval pipeline, down to the exact passages an
answer was built from.

![RAG Lens — knowledge graph](docs/preview.png)

![RAG Lens — retrieval trace](docs/preview-trace.png)

---

## The problem

RAG systems are opaque. When an answer is wrong, you can't tell whether the
retriever missed the right chunk, the reranker demoted it, or the model
hallucinated. Teams debug this by guessing.

## The idea

Make retrieval **visible**.

1. **The graph** — every document becomes a node; detected relationships
   (semantic similarity, shared entities, citations, temporal overlap) become
   edges, distinguished by line style and weighted by confidence.
2. **The trace** — ask a question and watch it move through *embed → search →
   rerank → synthesise*, with per-stage latency.
3. **The citations** — the retrieved chunks surface with similarity scores, and
   the documents they came from light up on the graph with a retrieval reticle.

At a glance you can see which documents carry an answer — and which ones the
retriever silently ignored.

---

## Features

- **Force-directed knowledge graph** — nodes settle organically with
  spring/repulsion physics; drag any node to rearrange the layout.
- **Retrieval trace** — a collapsible breakdown of the pipeline stages and
  their timings, so latency is attributable.
- **Cited-passage panel** — the actual chunks retrieval returned, ranked by
  similarity, each tagged with its source document.
- **Graph highlighting** — cited documents glow with an animated reticle;
  edges between two cited documents light up.
- **Connection inspector** — for any selected document, see every related
  document with the reason for the link and a confidence bar.
- **Upload flow** — drag-and-drop PDF / DOCX / TXT ingestion into the corpus.
- **One-click example questions** — jump straight into the interesting parts
  of the corpus.

---

## Architecture

```
src/
  App.tsx                 top-level state + layout
  components/
    Graph.tsx             canvas force-directed graph + physics
    QueryBar.tsx          question input + example prompts
    AnswerCard.tsx        the RAG trace view (answer, stages, passages)
    DocumentDetails.tsx   right inspector (connections / topics)
    ConnectionPanel.tsx   relationship list with strength bars
    TopicsPanel.tsx       extracted keywords
    Sidebar.tsx           upload zone + document list + edge legend
    DocumentList.tsx      corpus list
    UploadZone.tsx        drag-and-drop ingestion
    ui.tsx                shared primitives (Dot, StatusChip, palette)
  api/
    index.ts              barrel export — the only surface App imports
    documents.ts          list / get / upload / delete
    connections.ts        relationship queries
    query.ts              retrieval + synthesis (mock RAG pipeline)
    status.ts             vector DB health
    mockData.ts           sample corpus
  types/index.ts          shared domain types
```

**Swap in a real backend without touching the UI.** Every function in
`src/api/` returns `ApiResponse<T>` and has a commented-out `fetch()`
implementation showing the expected endpoint. Replace the stub bodies and the
rest of the app keeps working unchanged.

## Tech stack

- **React 19** + **TypeScript**
- **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- Canvas 2D for the graph — no charting dependency, a hand-rolled force
  simulation so the frame loop owns node state without React re-renders.

## Running locally

Requires Node 22+ and pnpm (the version is pinned in `package.json` and
`.mise.toml`). If you use [mise](https://mise.jdx.dev), just run `mise install`.

```bash
pnpm install
pnpm dev         # dev server
pnpm typecheck   # TypeScript, no emit
pnpm build       # production build → dist/
pnpm preview     # serve the production build
```

## Deploying

The build is a fully static bundle in `dist/`, so it runs anywhere that serves
files. The Vite `base` defaults to a relative path, which means the same build
works at a domain root *or* in a subdirectory like a GitHub Pages project site —
you don't have to configure the repo name anywhere.

### GitHub Pages (automated)

`.github/workflows/deploy.yml` type-checks, builds and publishes on every push
to `main`. To turn it on:

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` (or run the workflow manually). The site lands at
   `https://<user>.github.io/<repo>/`.

> Images are tracked with Git LFS, so the workflow checks out with `lfs: true`.
> Install [Git LFS](https://git-lfs.com) before pushing if you haven't already:
> `git lfs install`.

### Netlify / Vercel / Cloudflare Pages

Point the project at the repo and use:

| Setting | Value |
| --- | --- |
| Install command | `pnpm install` |
| Build command | `pnpm build` |
| Output directory | `dist` |

### Any static host

```bash
pnpm build
# then upload the contents of dist/
```

If you need absolute asset URLs rather than relative ones, set `VITE_BASE` at
build time, e.g. `VITE_BASE=/my-subpath/ pnpm build`.

## Notes

The retrieval layer ships with a small mock corpus and a keyword-overlap
scorer that stands in for embeddings, so the demo is fully self-contained and
works offline. It's deliberately isolated behind `src/api/query.ts`.

The corpus is mock data — swap `src/api/` for real endpoints and nothing in the
UI has to change.

## License

[MIT](LICENSE)

---

Built for the Hacker House.
