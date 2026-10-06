interface Props {
  task: { id: number; title: string; description: string; sessionId: string | null };
  onMove: (id: number, column: string) => void;
  onDelete: (id: number) => void;
  columns: string[];
  currentColumn: string;
}

export function KanbanCard({ task, onMove, onDelete, columns, currentColumn }: Props) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: 'var(--bg)',
      marginBottom: '6px',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>{task.title}</div>
      {task.description && <div style={{ fontSize: '0.75rem', color: 'var(--fg3)', marginBottom: '6px' }}>{task.description}</div>}
      {task.sessionId && <div style={{ fontSize: '0.7rem', color: 'var(--cyan)' }}>Session: {task.sessionId.slice(0, 8)}</div>}
      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
        {columns.filter(c => c !== currentColumn).map(col => (
          <button key={col} onClick={() => onMove(task.id, col)} style={{
            padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)',
            background: 'var(--bg-surface)', color: 'var(--fg3)',
            fontSize: '0.65rem', cursor: 'pointer',
          }}>{col}</button>
        ))}
        <button onClick={() => onDelete(task.id)} style={{
          padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)',
          background: 'var(--bg-surface)', color: 'var(--red)',
          fontSize: '0.65rem', cursor: 'pointer', marginLeft: 'auto',
        }}>x</button>
      </div>
    </div>
  );
}
