import type { AgentProfile } from '@konduktor/shared';

interface Props {
  profile: AgentProfile;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}

export function ProfileCard({ profile, onEdit, onDelete }: Props) {
  return (
    <div style={{
      padding: '16px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.5rem' }}>{profile.icon}</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{profile.name}</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--fg3)' }}>
              {profile.model} · {profile.memoryPolicy}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => onEdit(profile.id)} style={{
            padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--fg2)', cursor: 'pointer',
          }}>Edit</button>
          <button onClick={() => onDelete(profile.id)} style={{
            padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--red, #e55)',
            borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--red, #e55)', cursor: 'pointer',
          }}>Delete</button>
        </div>
      </div>
      {profile.skills.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '10px', flexWrap: 'wrap' }}>
          {profile.skills.map(s => (
            <span key={s} style={{
              padding: '2px 8px', fontSize: '0.7rem', borderRadius: '999px',
              background: 'var(--purple-soft)', color: 'var(--purple)',
            }}>{s}</span>
          ))}
        </div>
      )}
      {profile.systemPrompt && (
        <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--fg3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{profile.systemPrompt}</p>
      )}
    </div>
  );
}
