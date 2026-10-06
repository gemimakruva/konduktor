import { useState, useEffect, useCallback } from 'react';

interface McpServer { name: string; status: string; error?: string; }

export function McpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/capabilities/mcp');
      setServers(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addServer = async () => {
    if (!newName.trim() || !newCommand.trim()) return;
    const parts = newCommand.trim().split(/\s+/);
    await fetch('/api/capabilities/mcp/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, command: parts[0], args: parts.slice(1) }),
    });
    setNewName(''); setNewCommand('');
    refresh();
  };

  const removeServer = async (name: string) => {
    await fetch(`/api/capabilities/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' });
    refresh();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="Server name" style={{
            padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', fontSize: '0.8rem', width: '140px',
          }} />
        <input value={newCommand} onChange={e => setNewCommand(e.target.value)}
          placeholder="npx -y @example/mcp-server" style={{
            flex: 1, padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', background: 'var(--bg)',
            color: 'var(--fg)', fontSize: '0.8rem',
          }} />
        <button onClick={addServer} style={{
          padding: '8px 16px', borderRadius: 'var(--radius-md)',
          border: 'none', background: 'var(--purple)',
          color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Add</button>
      </div>
      {loading && <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading MCP servers...</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {servers.map(s => (
          <div key={s.name} style={{
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: s.status === 'connected' ? 'var(--green)' : 'var(--red)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.name}</div>
              {s.error && <div style={{ fontSize: '0.7rem', color: 'var(--red)' }}>{s.error}</div>}
            </div>
            <button onClick={() => removeServer(s.name)} style={{
              padding: '4px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
            }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
