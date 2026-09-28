# RAG Lens

**See inside your AI's knowledge.**

RAG Lens is a working observability surface for retrieval-augmented generation
(RAG). Most RAG apps hand you an answer and hope you trust it. RAG Lens shows
you the *why*: it maps your document corpus as a live relationship graph and
traces every question through the real retrieval pipeline, down to the exact
passages an answer was built from.

It runs entirely in the browser on Google's **Gemini free tier** — one API key
covers both embeddings and generation, and there's no server to deploy.

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
   become edges, weighted by the real cosine similarity of their embeddings.
2. **The trace** — ask a question and watch it move through *embed → search →
   rerank → synthesise*, with per-stage latency measured, not simulated.
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
- **Real ingestion** — drop in a text file and it is chunked, embedded and
  searchable immediately.
- **One-click example questions** — jump straight into the interesting parts
  of the corpus.
- **Honest fallback** — with no API key the app switches to a bundled keyword
  demo and labels itself, rather than passing off a template as a model answer.

---

## How it works

Everything happens in the browser; there is no backend.

**Indexing.** Each document is split into overlapping ~800-character chunks
(`corpus.ts`), and each chunk is embedded via `batchEmbedContents`. Vectors are
kept in memory and mirrored to `localStorage`, so reloading doesn't re-spend
free-tier quota.

**Querying.**

1. The question is embedded with `RETRIEVAL_QUERY` task type.
2. `vectorStore.ts` runs a brute-force cosine scan over the chunk vectors —
   plenty at this corpus size, and it means retrieval genuinely runs locally.
3. The top candidates are rescored with a hybrid vector + lexical score, which
   lifts passages that share the question's exact wording.
4. The surviving passages are sent to Gemini with instructions to answer *only*
   from them and cite them inline. Answers come back as prose with `[1]`-style
   references.

**The graph.** Edges are derived, not hardcoded: for every pair of indexed
documents the closest chunk pair is found and its similarity becomes the edge
weight, with both passages stored so the link can be explained in the
inspector. Documents still being processed are excluded from retrieval and show
up as unconnected nodes.

**Model selection.** The `/models` listing can't be trusted on its own — it
lists models a key isn't allowed to call, and Google retires models for new
users while still advertising them (both `gemini-2.0-flash` and
`gemini-2.5-flash` 404 with "no longer available to new users"). So `gemini.ts`
prefers the `-latest` aliases, falls back through a ranked candidate list, and
lets the first *real* call double as the capability probe, caching whichever
model answers. Transient `429`/`5xx` responses are retried with backoff before
switching models.

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
    apiKey.ts             key resolution (runtime paste, then build-time env)
    gemini.ts             REST client: embeddings + generation, model probing
    corpus.ts             the document store, chunking, text ingestion
    vectorStore.ts        embedding index, localStorage cache, cosine search
    documents.ts          list / get / ingest / delete
    connections.ts        graph edges derived from embedding similarity
    query.ts              the pipeline: embed → search → rescore → synthesise
    status.ts             live-vs-offline status
    mockData.ts           seeded sample corpus
  types/index.ts          shared domain types
```

Everything in `src/api/` returns a typed `ApiResponse<T>`, and `App.tsx` imports
only from the barrel (`api/index.ts`) — so the retrieval layer can be swapped
wholesale without touching a single component.

To move to a server later, replace `vectorStore.ts` with calls to a real vector
DB and `gemini.ts` with your own endpoint. Nothing else changes.

## Tech stack

- **React 19** + **TypeScript**
- **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **Google Gemini free tier** for embeddings and generation, called directly
  over REST — no SDK, no server, no billing
- Canvas 2D for the graph — no charting dependency, a hand-rolled force
  simulation so the frame loop owns node state without React re-renders.

## Running locally

Requires Node 22+ and pnpm (the version is pinned in `package.json` and
`.mise.toml`). If you use [mise](https://mise.jdx.dev), just run `mise install`.

You also need a free Gemini API key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). Copy the
example env file and paste it in:

```bash
cp .env.example .env    # then set VITE_GEMINI_API_KEY
```

Without a key the app still runs — it falls back to a bundled keyword demo and
says so in the header.

```bash
pnpm install
pnpm dev         # dev server
pnpm typecheck   # TypeScript, no emit
pnpm build       # production build → dist/
pnpm preview     # serve the production build
```

### Where the key lives

`.env` is gitignored. `VITE_*` variables are **inlined into the JS bundle**,
which means any build made with a key in `.env` ships that key to anyone who
opens the site. So:

- **Local development** — use `.env`. Convenient, and the build never leaves
  your machine.
- **A public deployment** — don't put the key in `.env`. Open the running app,
  click **About → Retrieval**, and paste the key there. It's stored in that
  browser's `localStorage`, never reaches the bundle, and never reaches the
  repo.

The included GitHub Pages workflow deliberately has no key, so the deployed
site starts in offline mode until someone pastes one in.

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

The seeded corpus is five short sample documents, each split into a handful of
chunks — small enough that indexing costs one API call and fits comfortably in
`localStorage`.

Uploads accept text formats (`.txt`, `.md`, `.csv`, `.json`, `.log`). PDF and
DOCX would need a parser dependency; the app declines them explicitly rather
than accepting a file it can't read.

### Free-tier limits (read this before demoing)

The Gemini free tier meters generation **per day, per model**:

```
GenerateRequestsPerDayPerProjectPerModel-FreeTier   →  20 requests / day / model
```

So you get roughly 20 questions per day for a given model. Because the quota is
per *model* rather than per project, exhausting one model doesn't exhaust the
next — `gemini.ts` detects this and moves to the next candidate automatically,
and stops immediately if the limit is project-wide instead.

Two things that keep usage low:

- Embeddings are cached in `localStorage`, so reloading the page never re-embeds
  the corpus. Only the question and the answer cost a call each.
- Ingestion is one batched embedding request regardless of how many chunks a
  document has.

Models default to `gemini-embedding-001` and the `gemini-flash-latest` alias,
with automatic fallback if either is renamed or retired. Pin specific ones with
`VITE_GEMINI_EMBED_MODEL` / `VITE_GEMINI_CHAT_MODEL`.

## License

[MIT](LICENSE)

---

Built for the Hacker House.
