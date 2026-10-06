import { useState, useEffect } from 'react';
import type { Settings } from '@konduktor/shared';
import { ThemeToggle } from './ThemeToggle';

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings);
  }, []);

  const update = async (patch: Partial<Settings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated as Settings);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (patch.theme) {
      document.documentElement.setAttribute('data-theme',
        patch.theme === 'system' ? '' : patch.theme);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return <p style={{ color: 'var(--fg3)' }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '24px' }}>Settings</h2>

      <section style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Theme</label>
        <ThemeToggle value={settings.theme} onChange={t => update({ theme: t })} />
      </section>

      <section style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Max concurrent sessions</label>
        <input type="number" min={1} max={10} value={settings.maxConcurrentSessions}
          onChange={e => update({ maxConcurrentSessions: Number(e.target.value) })}
          style={{
            padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', width: '80px', fontSize: '0.875rem',
          }}
        />
      </section>

      <section style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>LAN access</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={settings.lanAccess} onChange={e => update({ lanAccess: e.target.checked })} />
          Allow access from other devices on network
        </label>
      </section>

      {saved && <p style={{ color: 'var(--green)', fontSize: '0.8rem', fontWeight: 500 }}>Settings saved</p>}

      <div style={{
        marginTop: '32px', padding: '12px 16px',
        borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)',
        fontSize: '0.75rem', color: 'var(--fg3)',
      }}>
        Konduktor v0.1.0 | by Makruva | MIT License
      </div>
    </div>
  );
}
