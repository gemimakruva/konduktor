interface Props {
  value: 'light' | 'dark' | 'system';
  onChange: (v: 'light' | 'dark' | 'system') => void;
}

const OPTIONS: Props['value'][] = ['light', 'dark', 'system'];

export function ThemeToggle({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: '4px', padding: '2px', background: 'var(--bg-raised)', borderRadius: 'var(--radius-md)' }}>
      {OPTIONS.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} style={{
          padding: '6px 14px', borderRadius: 'var(--radius-sm)',
          border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
          background: value === opt ? 'var(--bg-surface)' : 'transparent',
          color: value === opt ? 'var(--fg)' : 'var(--fg3)',
          boxShadow: value === opt ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
        }}>
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </button>
      ))}
    </div>
  );
}
