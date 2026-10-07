import { useState, useEffect } from 'react';
import type { Settings } from '@konduktor/shared';
import { ThemeToggle } from './ThemeToggle';
import { SecretsSection } from './SecretsSection';
import { useNotifications } from '../../hooks/useNotifications';

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const { permission, requestPermission } = useNotifications();
  const [notifError, setNotifError] = useState('');
  const [shutdownState, setShutdownState] = useState<'idle' | 'confirm' | 'done'>('idle');

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
    window.dispatchEvent(new CustomEvent('settings-changed'));
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
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Default model</label>
        <select value={settings.defaultModel || ''} onChange={e => update({ defaultModel: e.target.value })}
          style={{
            padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', fontSize: '0.8rem', minWidth: '220px',
          }}>
          <option value="">Claude Code default</option>
          <option value="claude-sonnet-4-20250514">Sonnet 4</option>
          <option value="claude-sonnet-5-5">Sonnet 5.5</option>
          <option value="claude-opus-4-6">Opus 4.6</option>
          <option value="claude-opus-5-5">Opus 5.5</option>
          <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
        </select>
        <p style={{ fontSize: '0.7rem', color: 'var(--fg3)', marginTop: '4px' }}>
          Model used for chat sessions. Overrides Claude Code&apos;s own default.
        </p>
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

      <section style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Desktop notifications</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={settings.desktopNotifications}
            onChange={async (e) => {
              const want = e.target.checked;
              if (want) {
                const granted = await requestPermission();
                if (!granted) {
                  setNotifError('Permission denied by browser');
                  setTimeout(() => setNotifError(''), 3000);
                  return;
                }
              }
              update({ desktopNotifications: want });
            }} />
          Notify when sessions or cron jobs complete
        </label>
        {notifError && (
          <p style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: '4px' }}>{notifError}</p>
        )}
        {permission === 'denied' && (
          <p style={{ color: 'var(--fg3)', fontSize: '0.7rem', marginTop: '4px' }}>
            Notifications blocked. Enable in browser settings.
          </p>
        )}
      </section>

      <SecretsSection />

      {saved && <p style={{ color: 'var(--green)', fontSize: '0.8rem', fontWeight: 500 }}>Settings saved</p>}

      <section style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>Server</label>
        {shutdownState === 'idle' && (
          <button onClick={() => setShutdownState('confirm')} style={{
            padding: '8px 16px', border: '1px solid var(--red, #e55)', borderRadius: 'var(--radius-md)',
            background: 'transparent', color: 'var(--red, #e55)', fontSize: '0.8rem', cursor: 'pointer',
          }}>
            Shutdown Server
          </button>
        )}
        {shutdownState === 'confirm' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--fg2)' }}>Are you sure?</span>
            <button onClick={async () => {
              await fetch('/api/shutdown', { method: 'POST' });
              setShutdownState('done');
            }} style={{
              padding: '6px 14px', border: 'none', borderRadius: 'var(--radius-md)',
              background: 'var(--red, #e55)', color: '#fff', fontSize: '0.8rem', cursor: 'pointer',
            }}>
              Yes, shutdown
            </button>
            <button onClick={() => setShutdownState('idle')} style={{
              padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--fg2)', fontSize: '0.8rem', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </div>
        )}
        {shutdownState === 'done' && (
          <p style={{ fontSize: '0.8rem', color: 'var(--fg3)' }}>
            Server stopped. Close this tab or restart with <code>konduktor start</code>.
          </p>
        )}
      </section>

      <div style={{
        marginTop: '24px', padding: '12px 16px',
        borderRadius: 'var(--radius-md)', background: 'var(--bg-raised)',
        fontSize: '0.75rem', color: 'var(--fg3)',
      }}>
        Konduktor v0.1.0 | by Makruva | MIT License
      </div>
    </div>
  );
}
