/**
 * QueryBar — search input + Ask button, with a row of example questions
 * so the capability of the retrieval layer is obvious at a glance.
 */

interface QueryBarProps {
  value: string
  thinking: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  /** One-click example questions — picking one runs the query immediately */
  suggestions?: string[]
  onPick?: (question: string) => void
}

export default function QueryBar({
  value,
  thinking,
  onChange,
  onSubmit,
  suggestions = [],
  onPick,
}: QueryBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') onSubmit()
  }

  return (
    <div className="border-b shrink-0" style={{ borderColor: '#1e1e22' }}>
      <div className="px-5 pt-3 pb-2 flex items-center gap-3">
        <span className="text-sm shrink-0" style={{ color: '#52525b' }} aria-hidden>
          ⌕
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question across all documents…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: '#f4f4f5', caretColor: '#fafafa' }}
          disabled={thinking}
          aria-label="Query input"
        />
        <button
          onClick={onSubmit}
          disabled={thinking || !value.trim()}
          className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            backgroundColor: thinking ? '#141417' : !value.trim() ? '#1a1a1e' : '#fafafa',
            color: thinking || !value.trim() ? '#71717a' : '#09090b',
            cursor: thinking || !value.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {thinking ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="px-5 pb-3 flex gap-2 flex-wrap">
          {suggestions.map((s) => (
            <button
              key={s}
              disabled={thinking}
              onClick={() => onPick?.(s)}
              className="text-[11px] px-2.5 py-1 rounded-full border transition-colors hover:border-zinc-700 hover:text-zinc-200"
              style={{
                borderColor: '#1e1e22',
                color: '#a1a1aa',
                backgroundColor: 'transparent',
                cursor: thinking ? 'not-allowed' : 'pointer',
                opacity: thinking ? 0.5 : 1,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
