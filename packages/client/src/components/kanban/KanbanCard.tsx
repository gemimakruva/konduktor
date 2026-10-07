interface AgentOption {
  id: number;
  name: string;
  icon: string;
}

interface Props {
  task: { id: number; title: string; description: string; sessionId: string | null };
  onMove: (id: number, column: string) => void;
  onDelete: (id: number) => void;
  onAssign?: (taskId: number, agentId: number) => void;
  columns: string[];
  currentColumn: string;
  agentName?: string;
  agentIcon?: string;
  agents?: AgentOption[];
}

export function KanbanCard({ task, onMove, onDelete, onAssign, columns, currentColumn, agentName, agentIcon, agents }: Props) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)', background: 'var(--bg)',
      marginBottom: '6px',
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>{task.title}</div>
      {task.description && <div style={{ fontSize: '0.75rem', color: 'var(--fg3)', marginBottom: '6px' }}>{task.description}</div>}
      {task.sessionId && <div style={{ fontSize: '0.7rem', color: 'var(--cyan)' }}>Session: {task.sessionId.slice(0, 8)}</div>}
      {agentName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px',
          fontSize: '0.7rem', color: 'var(--purple)' }}>
          <span>{agentIcon}</span> {agentName}
        </div>
      )}
      <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
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
      {agents && agents.length > 0 && onAssign && !agentName && (
        <select onChange={e => { if (e.target.value) onAssign(task.id, Number(e.target.value)); e.target.value = ''; }}
          defaultValue="" style={{
            marginTop: '6px', padding: '2px 4px', fontSize: '0.65rem', width: '100%',
            border: '1px solid var(--border)', borderRadius: '3px',
            background: 'var(--bg-surface)', color: 'var(--fg3)', cursor: 'pointer',
          }}>
          <option value="" disabled>Assign agent...</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
