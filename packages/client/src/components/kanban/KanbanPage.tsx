import { useState, useEffect, useCallback } from 'react';
import { KanbanCard } from './KanbanCard';

interface Task { id: number; title: string; description: string; column: string; sessionId: string | null; }
interface Profile { id: number; name: string; icon: string; }
interface Assignment { taskId: number; agentId: number; }

const COLUMNS = ['backlog', 'in-progress', 'review', 'done'];
const COLUMN_COLORS: Record<string, string> = {
  backlog: 'var(--fg3)', 'in-progress': 'var(--purple)', review: 'var(--amber)', done: 'var(--green)',
};

export function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/kanban');
    setTasks(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    fetch('/api/profiles').then(r => r.json()).then(setProfiles);
    fetch('/api/kanban/assignments').then(r => r.json()).then(
      (list: { taskId: number; agentId: number }[]) => setAssignments(list.map(a => ({ taskId: a.taskId, agentId: a.agentId }))),
    );
  }, []);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, column: 'backlog' }),
    });
    setNewTitle('');
    refresh();
  };

  const moveTask = async (id: number, column: string) => {
    await fetch(`/api/kanban/${id}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column }),
    });
    refresh();
  };

  const deleteTask = async (id: number) => {
    await fetch(`/api/kanban/${id}`, { method: 'DELETE' });
    refresh();
  };

  const assignAgent = async (taskId: number, agentId: number) => {
    await fetch(`/api/kanban/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    setAssignments(prev => [...prev, { taskId, agentId }]);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Kanban</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="New task..." style={{
              padding: '6px 10px', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', background: 'var(--bg)',
              color: 'var(--fg)', fontSize: '0.8rem', width: '200px',
            }} />
          <button onClick={addTask} style={{
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            border: 'none', background: 'var(--purple)',
            color: 'white', fontSize: '0.8rem', cursor: 'pointer',
          }}>Add</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: '12px', minHeight: 400 }}>
        {COLUMNS.map(col => (
          <div key={col} style={{
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', padding: '10px',
          }}>
            <h3 style={{
              fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.05em', color: COLUMN_COLORS[col],
              marginBottom: '10px',
            }}>{col} ({tasks.filter(t => t.column === col).length})</h3>
            {tasks.filter(t => t.column === col).map(task => {
              const assignment = assignments.find(a => a.taskId === task.id);
              const agent = assignment ? profiles.find(p => p.id === assignment.agentId) : undefined;
              return (
                <KanbanCard key={task.id} task={task} onMove={moveTask} onDelete={deleteTask}
                  onAssign={assignAgent} columns={COLUMNS} currentColumn={col}
                  agentName={agent?.name} agentIcon={agent?.icon}
                  agents={profiles.map(p => ({ id: p.id, name: p.name, icon: p.icon }))} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
