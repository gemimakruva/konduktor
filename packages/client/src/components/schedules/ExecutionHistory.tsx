import { useState, useEffect } from 'react';

interface Execution {
  id: number;
  status: string;
  output: string;
  startedAt: number;
  finishedAt: number | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export function ExecutionHistory({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const [executions, setExecutions] = useState<Execution[]>([]);

  useEffect(() => {
    fetch(`/api/cron/${jobId}/executions`).then(r => r.json()).then(setExecutions);
  }, [jobId]);

  const statusColor = (s: string) => s === 'completed' ? 'var(--green)' : s === 'failed' ? 'var(--red)' : 'var(--amber)';

  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', padding: '16px', marginTop: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Execution History</h3>
        <button onClick={onClose} style={{
          padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          background: 'var(--bg)', color: 'var(--fg3)', fontSize: '0.7rem', cursor: 'pointer',
        }}>Close</button>
      </div>
      {executions.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>No executions yet</p>}
      {executions.map(e => (
        <div key={e.id} style={{
          padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.8rem',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(e.status), flexShrink: 0 }} />
          <span style={{ color: 'var(--fg3)', minWidth: 120, fontSize: '0.75rem' }}>
            {new Date(e.startedAt).toLocaleString()}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.output.slice(0, 100) || '(no output)'}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
            ${e.costUsd.toFixed(4)} | {(e.inputTokens + e.outputTokens).toLocaleString()} tok
          </span>
        </div>
      ))}
    </div>
  );
}
