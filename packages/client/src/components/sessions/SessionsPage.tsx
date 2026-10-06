import { useSessions } from '../../hooks/useSessions';
import { SessionCard } from './SessionCard';

export function SessionsPage() {
  const { sessions, loading, refresh, stopSession, removeSession } = useSessions();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Sessions</h2>
        <button onClick={refresh} style={{
          padding: '6px 12px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--bg-surface)',
          cursor: 'pointer', fontSize: '0.8rem', color: 'var(--fg2)',
        }}>Refresh</button>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.85rem' }}>Loading...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sessions.map(s => (
          <SessionCard key={s.sessionId} session={s} onStop={stopSession} onRemove={removeSession} />
        ))}
        {!loading && sessions.length === 0 && (
          <p style={{ color: 'var(--fg3)', fontSize: '0.85rem' }}>No active sessions</p>
        )}
      </div>
    </div>
  );
}
