import { useState, useEffect, useCallback } from 'react';

interface Plugin { id: string; version: string; scope: string; enabled: boolean; }

export function PluginsTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installId, setInstallId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/capabilities/plugins');
      setPlugins(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const install = async () => {
    if (!installId.trim()) return;
    await fetch('/api/capabilities/plugins/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: installId }),
    });
    setInstallId('');
    refresh();
  };

  const toggle = async (p: Plugin) => {
    const action = p.enabled ? 'disable' : 'enable';
    await fetch(`/api/capabilities/plugins/${encodeURIComponent(p.id)}/${action}`, { method: 'POST' });
    refresh();
  };

  const uninstall = async (id: string) => {
    await fetch(`/api/capabilities/plugins/${encodeURIComponent(id)}/uninstall`, { method: 'POST' });
    refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={installId} onChange={e => setInstallId(e.target.value)}
          placeholder="plugin-name@marketplace" style={{
            flex: 1, padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', fontSize: '0.8rem',
          }} />
        <button onClick={install} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)',
          border: 'none', background: 'var(--purple)',
          color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Install</button>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading plugins...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {plugins.map(p => (
          <div key={p.id} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.id}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
                v{p.version} | {p.scope} | {p.enabled ? 'enabled' : 'disabled'}
              </div>
            </div>
            <button onClick={() => toggle(p)} style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: p.enabled ? 'var(--amber)' : 'var(--green)',
              fontSize: '0.7rem', cursor: 'pointer',
            }}>{p.enabled ? 'Disable' : 'Enable'}</button>
            <button onClick={() => uninstall(p.id)} style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
            }}>Uninstall</button>
          </div>
        ))}
      </div>
    </div>
  );
}
