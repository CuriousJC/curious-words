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

// Fisher-Yates, on a copy. Returns a new array so the caller's list is left
// alone -- shuffling in place would mutate the array `map` just handed us, which
// happens to be safe here but stops being safe the moment anything else holds a
// reference to it.
function shuffle(list) {
  const shuffled = [...list]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Tags describing the whole collection rather than the individual quote. Every
// two-part subject carries `paired`, and 317 quotes carry `polarity` on top of
// that -- useful to filter by, but repeated on hundreds of entries, so they are
// rendered muted rather than competing with the subject tags for attention.
const COLLECTIVE_TAGS = new Set(['paired', 'polarity'])

export default function App() {
  const [quotes, setQuotes] = useState([])
  const [status, setStatus] = useState('loading')
  const [query, setQuery] = useState('')
  // Tags AND together: selecting `polarity` then `life` narrows to quotes
  // carrying both, rather than widening to either.
  const [activeTags, setActiveTags] = useState(() => new Set())
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
        // Shuffled once, here, rather than in the render path. Order is fixed for
        // the life of the page: filtering and searching reorder nothing, so a
        // quote does not move out from under you as you type. Reloading is what
        // reshuffles.
        //
        // Normalise first, then shuffle -- `id` is position in the source file
        // and has to be assigned before anything moves.
        setQuotes(shuffle(list.map(normalise)))
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
    const terms = needle ? needle.split(/\s+/) : []
    const tags = [...activeTags]

    return quotes.filter((quote) => {
      // Exact tag membership, deliberately not a haystack substring match.
      // Searching the text for "evil & good" also catches quotes that merely
      // contain those three words; carrying the tag is a different claim.
      if (!tags.every((tag) => quote.tags.includes(tag))) return false
      // Every space-separated term must appear somewhere, so "orwell language"
      // narrows rather than widening.
      return terms.every((term) => quote.haystack.includes(term))
    })
  }, [query, quotes, activeTags])

  // Sets are mutable, and React compares by reference -- mutating the existing
  // one and calling setState with it would change nothing on screen. Always
  // build a new Set.
  function toggleTag(tag) {
    setActiveTags((current) => {
      const next = new Set(current)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setQuery('')
      setActiveTags(new Set())
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

      {activeTags.size > 0 && (
        <p className="active-filters">
          <span className="active-label">Filtering by</span>
          {[...activeTags].map((tag) => (
            // Repeating the tag name in the label keeps it meaningful to a screen
            // reader, which announces the button out of its visual context.
            <button
              key={tag}
              type="button"
              className="tag tag-active"
              onClick={() => toggleTag(tag)}
              aria-label={`Remove filter ${tag}`}
            >
              {tag}
              <span aria-hidden="true"> ×</span>
            </button>
          ))}
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
            <p className="note">
              {query.trim()
                ? `Nothing matches “${query}”`
                : 'No quotes carry all of those tags'}
              . Press Esc to clear.
            </p>
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
                  {quote.tags.length > 0 && (
                    <p className="tags">
                      {quote.tags.map((tag) => (
                        // Buttons rather than spans: these do something, so they
                        // need to be reachable by keyboard and announced as
                        // controls rather than decoration.
                        <button
                          key={tag}
                          type="button"
                          className={
                            'tag' +
                            (COLLECTIVE_TAGS.has(tag) ? ' tag-collective' : '') +
                            (activeTags.has(tag) ? ' tag-active' : '')
                          }
                          onClick={() => toggleTag(tag)}
                          aria-pressed={activeTags.has(tag)}
                        >
                          {tag}
                        </button>
                      ))}
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
