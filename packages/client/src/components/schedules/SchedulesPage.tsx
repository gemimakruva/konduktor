import { useState, useEffect, useCallback } from 'react';
import { ExecutionHistory } from './ExecutionHistory';

interface Job { id: number; name: string; schedule: string; prompt: string; enabled: boolean; createdAt: number; }

export function SchedulesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newSchedule, setNewSchedule] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setJobs(await (await fetch('/api/cron')).json()); } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addJob = async () => {
    if (!newName.trim() || !newSchedule.trim() || !newPrompt.trim()) return;
    setError('');
    const res = await fetch('/api/cron', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, schedule: newSchedule, prompt: newPrompt }),
    });
    if (!res.ok) { const body = await res.json(); setError(body.error || 'Failed'); return; }
    setNewName(''); setNewSchedule(''); setNewPrompt('');
    refresh();
  };

  const toggle = async (job: Job) => {
    const action = job.enabled ? 'disable' : 'enable';
    await fetch(`/api/cron/${job.id}/${action}`, { method: 'POST' });
    refresh();
  };

  const deleteJob = async (id: number) => {
    await fetch(`/api/cron/${id}`, { method: 'DELETE' });
    refresh();
  };

  const runNow = async (id: number) => {
    await fetch(`/api/cron/${id}/run`, { method: 'POST' });
    refresh();
  };

  const inputStyle = {
    padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.8rem',
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Schedules</h2>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Job name"
          style={{ ...inputStyle, width: '140px' }} />
        <input value={newSchedule} onChange={e => setNewSchedule(e.target.value)} placeholder="0 9 * * * (cron)"
          style={{ ...inputStyle, width: '140px', fontFamily: 'var(--font-mono)' }} />
        <input value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="Prompt to run..."
          style={{ ...inputStyle, flex: 1, minWidth: '200px' }} />
        <button onClick={addJob} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none',
          background: 'var(--purple)', color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Add</button>
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: '0.8rem', marginBottom: '8px' }}>{error}</p>}

      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {jobs.map(job => (
          <div key={job.id} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            opacity: job.enabled ? 1 : 0.6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{job.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>
                  {job.schedule} | {job.enabled ? 'enabled' : 'disabled'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--fg2)', marginTop: '2px' }}>
                  {job.prompt.length > 80 ? job.prompt.slice(0, 80) + '...' : job.prompt}
                </div>
              </div>
              <button onClick={() => setShowHistory(showHistory === job.id ? null : job.id)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--fg3)', fontSize: '0.7rem', cursor: 'pointer',
              }}>History</button>
              <button onClick={() => runNow(job.id)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--cyan)', fontSize: '0.7rem', cursor: 'pointer',
              }}>Run</button>
              <button onClick={() => toggle(job)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: job.enabled ? 'var(--amber)' : 'var(--green)',
                fontSize: '0.7rem', cursor: 'pointer',
              }}>{job.enabled ? 'Disable' : 'Enable'}</button>
              <button onClick={() => deleteJob(job.id)} style={{
                padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
              }}>Delete</button>
            </div>
            {showHistory === job.id && <ExecutionHistory jobId={job.id} onClose={() => setShowHistory(null)} />}
          </div>
        ))}
        {!loading && jobs.length === 0 && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>No scheduled jobs. Add one above.</p>}
      </div>
    </div>
  );
}
