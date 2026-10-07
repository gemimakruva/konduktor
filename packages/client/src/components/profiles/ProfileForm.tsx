import { useState } from 'react';
import type { AgentProfile } from '@konduktor/shared';

interface Props {
  initial?: AgentProfile;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

const inputStyle = {
  padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', background: 'var(--bg)',
  color: 'var(--fg)', fontSize: '0.85rem', width: '100%',
};

const labelStyle = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600 as const,
  color: 'var(--fg2)', marginBottom: '4px',
};

export function ProfileForm({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon || '🤖');
  const [model, setModel] = useState(initial?.model || 'claude-sonnet-5-5');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt || '');
  const [skills, setSkills] = useState(initial?.skills.join(', ') || '');
  const [defaultCwd, setDefaultCwd] = useState(initial?.defaultCwd || '');
  const [maxTasks, setMaxTasks] = useState(initial?.maxConcurrentTasks || 1);
  const [memoryPolicy, setMemoryPolicy] = useState(initial?.memoryPolicy || 'ephemeral');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name, icon, model, systemPrompt, defaultCwd,
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
      maxConcurrentTasks: maxTasks,
      memoryPolicy,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 500 }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ width: 60 }}>
          <label style={labelStyle}>Icon</label>
          <input value={icon} onChange={e => setIcon(e.target.value)} style={{ ...inputStyle, width: 50 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Agent name" />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Model</label>
        <select value={model} onChange={e => setModel(e.target.value)} style={inputStyle}>
          <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
          <option value="claude-opus-4-6">Claude Opus 4.6</option>
          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>System Prompt</label>
        <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
          rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Instructions for this agent" />
      </div>
      <div>
        <label style={labelStyle}>Skills (comma-separated)</label>
        <input value={skills} onChange={e => setSkills(e.target.value)} style={inputStyle}
          placeholder="frontend, react, css" />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Working Directory</label>
          <input value={defaultCwd} onChange={e => setDefaultCwd(e.target.value)} style={inputStyle}
            placeholder="/path/to/project" />
        </div>
        <div style={{ width: 80 }}>
          <label style={labelStyle}>Max Tasks</label>
          <input type="number" min={1} max={10} value={maxTasks}
            onChange={e => setMaxTasks(Number(e.target.value))} style={inputStyle} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Memory</label>
        <select value={memoryPolicy} onChange={e => setMemoryPolicy(e.target.value as 'ephemeral' | 'persistent')} style={inputStyle}>
          <option value="ephemeral">Ephemeral (new session each task)</option>
          <option value="persistent">Persistent (keep session alive)</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button onClick={handleSubmit} style={{
          padding: '8px 16px', border: 'none', borderRadius: 'var(--radius-md)',
          background: 'var(--purple)', color: '#fff', fontSize: '0.85rem', cursor: 'pointer',
        }}>{initial ? 'Update' : 'Create'} Profile</button>
        <button onClick={onCancel} style={{
          padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          background: 'transparent', color: 'var(--fg2)', fontSize: '0.85rem', cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </div>
  );
}
