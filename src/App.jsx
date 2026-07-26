import { useEffect, useMemo, useRef, useState } from 'react'

// The collection is a plain JSON file fetched at load. Keeping the data separate
// from the code means adding a quote never requires touching, understanding, or
// reasoning about any of this -- quotes.json changes and that is the whole edit.
const DATA_URL = '/quotes.json'

// Normalises one raw record into something the UI and the search can both rely
// on. Every field except `text` is optional, because a quote you remember without
// knowing who said it is still worth keeping -- the collection should not reject
// an entry for being incomplete.
function normalise(raw, index) {
  const text = typeof raw === 'string' ? raw : (raw.text ?? '')
  const author = typeof raw === 'string' ? null : (raw.author ?? null)
  const source = typeof raw === 'string' ? null : (raw.source ?? null)
  const tags = Array.isArray(raw.tags) ? raw.tags : []

  return {
    // Position in the source file, assigned once at parse time.
    //
    // The text is NOT an identity. The same line can legitimately appear twice
    // with different attributions -- misquotations and disputed sources are half
    // the interest of a collection like this. Keying on text would hand React
    // duplicate keys and break filtering. Do not dedupe this list.
    id: index,
    text,
    author,
    source,
    tags,
    // Precomputed once so filtering on every keystroke stays cheap.
    haystack: [text, author, source, ...tags].filter(Boolean).join(' ').toLowerCase(),
  }
}

export default function App() {
  const [quotes, setQuotes] = useState([])
  const [status, setStatus] = useState('loading')
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)

  // Runs once after the first render. The empty dependency array is what means
  // "once" -- without it this would refetch on every render.
  useEffect(() => {
    let cancelled = false

    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        // Tolerate both a bare array and an object with a `quotes` key, so the
        // file can grow metadata later without breaking this.
        const list = Array.isArray(data) ? data : (data.quotes ?? [])
        setQuotes(list.map(normalise))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    // Cleanup: if the component goes away mid-request, do not set state on
    // something that no longer exists.
    return () => {
      cancelled = true
    }
  }, [])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return quotes
    // Every space-separated term must appear somewhere, so "orwell language"
    // narrows rather than widening.
    const terms = needle.split(/\s+/)
    return quotes.filter((quote) => terms.every((term) => quote.haystack.includes(term)))
  }, [query, quotes])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setQuery('')
      searchRef.current?.focus()
    }
  }

  return (
    <div className="container">
      <header className="masthead">
        <h1>curious words</h1>
      </header>

      <input
        ref={searchRef}
        className="search"
        type="search"
        placeholder="Type to search..."
        value={query}
        autoFocus
        autoComplete="off"
        spellCheck="false"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      {status === 'loading' && <p className="note">Loading...</p>}

      {status === 'error' && (
        <p className="note error">
          Could not load <code>{DATA_URL}</code>. If this is a fresh deploy, the file may not
          have uploaded yet.
        </p>
      )}

      {status === 'ready' && (
        <>
          <p className="count">
            {results.length === quotes.length
              ? `${quotes.length} quotes`
              : `${results.length} of ${quotes.length} quotes`}
          </p>

          {results.length === 0 ? (
            <p className="note">Nothing matches &ldquo;{query}&rdquo;. Press Esc to clear.</p>
          ) : (
            <ul className="quotes">
              {results.map((quote) => (
                <li key={quote.id}>
                  <blockquote>{quote.text}</blockquote>
                  {(quote.author || quote.source) && (
                    <p className="attribution">
                      {quote.author && <span className="author">{quote.author}</span>}
                      {quote.source && <cite className="source">{quote.source}</cite>}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
