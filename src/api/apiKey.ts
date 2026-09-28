/**
 * API key resolution.
 *
 * Two sources, in priority order:
 *
 *   1. Runtime key — pasted into the UI and kept in localStorage. Never leaves
 *      this browser and never touches the repository. This is the safe option
 *      for a deployed build.
 *   2. Build-time key — `VITE_GEMINI_API_KEY` from a gitignored `.env` file.
 *      Convenient locally, but Vite inlines it into the JS bundle, so anyone
 *      can read it from a public site. Do not ship a build that uses this.
 *
 * Get a free key at https://aistudio.google.com/apikey
 */

const STORAGE_KEY = 'raglens.gemini.apiKey'

const ENV_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()

export type KeySource = 'runtime' | 'env' | 'none'

/** The key the user pasted in this browser, if any. */
export function getStoredKey(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY) ?? '').trim()
  } catch {
    // localStorage can throw in private mode / sandboxed iframes
    return ''
  }
}

export function setStoredKey(key: string): void {
  try {
    const trimmed = key.trim()
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearStoredKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** The key to use for API calls, or '' when none is configured. */
export function getApiKey(): string {
  return getStoredKey() || ENV_KEY
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

/** Where the active key came from — surfaced in the UI so it's never a mystery. */
export function keySource(): KeySource {
  if (getStoredKey()) return 'runtime'
  if (ENV_KEY) return 'env'
  return 'none'
}
