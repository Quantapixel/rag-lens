/// <reference types="vite/client" />
/// <reference types="vite/client" />

/**
 * Environment variables read at build time.
 *
 * NOTE: anything prefixed VITE_ is inlined into the client bundle and is
 * therefore public. Only use VITE_GEMINI_API_KEY for local development — for a
 * deployed build, paste the key at runtime instead (it stays in localStorage).
 */
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string
  /** Override the auto-selected models if Google renames them. */
  readonly VITE_GEMINI_CHAT_MODEL?: string
  readonly VITE_GEMINI_EMBED_MODEL?: string
}
