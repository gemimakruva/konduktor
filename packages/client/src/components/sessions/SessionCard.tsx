import type { Session } from '@konduktor/shared';

interface Props {
  session: Session;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
}

export function SessionCard({ session, onStop, onRemove }: Props) {
  const statusColor = session.status === 'busy' ? 'var(--green)' :
    session.status === 'idle' ? 'var(--amber)' : 'var(--fg3)';

  return (
    <div style={{
      padding: '12px 16px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: 'var(--bg-surface)',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: statusColor, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{session.name}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--fg3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.cwd} | pid {session.pid}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {session.status === 'busy' && (
          <button onClick={() => onStop(session.sessionId)} style={{
            padding: '4px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--amber)', cursor: 'pointer', fontSize: '0.75rem',
          }}>Stop</button>
        )}
        <button onClick={() => onRemove(session.sessionId)} style={{
          padding: '4px 10px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--bg)',
          color: 'var(--red)', cursor: 'pointer', fontSize: '0.75rem',
        }}>Remove</button>
      </div>
    </div>
  );
}
