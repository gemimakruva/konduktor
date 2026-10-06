import { useState, useCallback } from 'react';

interface SearchResult {
  session_id: string;
  role: string;
  content: string;
  highlight: string;
}

export function SearchBar({ onSelectSession }: { onSelectSession: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    setResults(await res.json());
    setOpen(true);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query} onChange={e => search(e.target.value)}
        placeholder="Search chat history..."
        style={{
          width: '100%', padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          color: 'var(--fg)', fontSize: '0.8rem',
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', maxHeight: 300, overflowY: 'auto',
          zIndex: 10, marginTop: 4,
        }}>
          {results.map((r, i) => (
            <div key={i} onClick={() => { onSelectSession(r.session_id); setOpen(false); }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem',
                borderBottom: '1px solid var(--border)',
              }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--fg3)', textTransform: 'uppercase' }}>{r.role}</span>
              <div dangerouslySetInnerHTML={{ __html: r.highlight }} style={{ lineHeight: 1.4 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
