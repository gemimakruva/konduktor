import { useState, useEffect, useCallback } from 'react';
import type { AgentProfile } from '@konduktor/shared';
import { ProfileCard } from './ProfileCard';
import { ProfileForm } from './ProfileForm';

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) setProfiles(await res.json());
    } catch { /* network error */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSave = async (data: Record<string, unknown>) => {
    if (editing) {
      await fetch(`/api/profiles/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    setEditing(null);
    setCreating(false);
    refresh();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/profiles/${id}`, { method: 'DELETE' });
    refresh();
  };

  if (creating || editing) {
    return (
      <div>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>
          {editing ? 'Edit Profile' : 'New Profile'}
        </h2>
        <ProfileForm initial={editing || undefined} onSave={handleSave}
          onCancel={() => { setCreating(false); setEditing(null); }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Agent Profiles</h2>
        <button onClick={() => setCreating(true)} style={{
          padding: '6px 14px', border: 'none', borderRadius: 'var(--radius-md)',
          background: 'var(--purple)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer',
        }}>+ New Profile</button>
      </div>
      {profiles.length === 0 && (
        <p style={{ color: 'var(--fg3)', fontSize: '0.85rem' }}>No profiles yet. Create one to get started.</p>
      )}
      <div style={{ display: 'grid', gap: '10px' }}>
        {profiles.map(p => (
          <ProfileCard key={p.id} profile={p}
            onEdit={(id) => setEditing(profiles.find(x => x.id === id)!)}
            onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}
