import { useState, useEffect, useCallback } from 'react';

interface Agent {
  pid: number; cwd: string; kind: string; startedAt: number;
  sessionId: string; name: string; status: string;
}

export function AgentWatch() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents?all=${showAll}`);
      setAgents(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [showAll]);

  useEffect(() => { refresh(); const iv = setInterval(refresh, 5000); return () => clearInterval(iv); }, [refresh]);

  const statusColor = (s: string) => s === 'busy' ? 'var(--green)' : s === 'idle' ? 'var(--amber)' : 'var(--fg3)';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Agent Watch</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Show completed
        </label>
      </div>
      {loading && agents.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {agents.map(a => (
          <div key={a.sessionId} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(a.status), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
                {a.kind} | pid {a.pid} | {a.cwd}
              </div>
            </div>
            <span style={{
              padding: '2px 8px', borderRadius: 'var(--radius-sm)',
              background: a.status === 'busy' ? 'rgba(34,197,94,0.1)' : 'var(--bg)',
              fontSize: '0.7rem', fontWeight: 600, color: statusColor(a.status),
            }}>{a.status}</span>
          </div>
        ))}
        {!loading && agents.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>No active agents</p>}
      </div>
    </div>
  );
}
