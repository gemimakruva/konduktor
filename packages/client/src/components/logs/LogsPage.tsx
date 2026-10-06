import { useState, useEffect, useCallback } from 'react';

interface LogEntry {
  session_id?: string;
  role?: string;
  content: string;
  created_at?: number;
  timestamp?: number;
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionFilter, setSessionFilter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const url = sessionFilter ? `/api/logs?sessionId=${encodeURIComponent(sessionFilter)}` : '/api/logs';
    try {
      const res = await fetch(url);
      setLogs(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [sessionFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Logs</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={sessionFilter} onChange={e => setSessionFilter(e.target.value)}
            placeholder="Filter by session ID..." style={{
              padding: '6px 10px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', background: 'var(--bg)',
              color: 'var(--fg)', fontSize: '0.8rem', width: '200px',
            }} />
          <button onClick={refresh} style={{
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            cursor: 'pointer', fontSize: '0.8rem', color: 'var(--fg2)',
          }}>Refresh</button>
        </div>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)', maxHeight: 'calc(100vh - 160px)',
        overflowY: 'auto', padding: '8px',
      }}>
        {logs.map((entry, i) => (
          <div key={i} style={{
            padding: '2px 0', borderBottom: '1px solid var(--border)',
            display: 'flex', gap: '8px',
          }}>
            {entry.session_id && <span style={{ color: 'var(--purple)', minWidth: 60 }}>{entry.session_id.slice(0, 8)}</span>}
            {entry.role && <span style={{ color: 'var(--cyan)', minWidth: 50, textTransform: 'uppercase' }}>{entry.role}</span>}
            <span style={{ color: 'var(--fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.content}</span>
          </div>
        ))}
        {!loading && logs.length === 0 && <p style={{ color: 'var(--fg3)' }}>No logs</p>}
      </div>
    </div>
  );
}
