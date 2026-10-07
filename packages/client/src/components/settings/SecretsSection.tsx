import { useState, useEffect, useCallback } from 'react';

interface SecretMeta {
  name: string;
  scope: string;
  createdAt: number;
}

export function SecretsSection() {
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState('global');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const res = await fetch('/api/secrets');
    if (res.ok) setSecrets(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addSecret = async () => {
    setError('');
    if (!name || !value) { setError('Name and value required'); return; }
    const res = await fetch('/api/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value, scope }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error || 'Failed to store secret');
      return;
    }
    setName(''); setValue(''); setScope('global');
    refresh();
  };

  const revoke = async (secretName: string) => {
    await fetch(`/api/secrets/${secretName}`, { method: 'DELETE' });
    refresh();
  };

  const inputStyle = {
    padding: '6px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', background: 'var(--bg)',
    color: 'var(--fg)', fontSize: '0.8rem',
  };

  return (
    <section style={{ marginBottom: '24px' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px', color: 'var(--fg2)' }}>
        Secrets
      </label>
      <p style={{ fontSize: '0.75rem', color: 'var(--fg3)', marginBottom: '12px' }}>
        Encrypted credentials injected as environment variables into agent and cron processes.
      </p>

      {secrets.length > 0 && (
        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', marginBottom: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg3)', fontWeight: 500 }}>Name</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--fg3)', fontWeight: 500 }}>Scope</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--fg3)', fontWeight: 500 }}>Added</th>
              <th style={{ width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {secrets.map(s => (
              <tr key={s.name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)' }}>{s.name}</td>
                <td style={{ padding: '6px 8px', color: 'var(--fg3)' }}>{s.scope}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--fg3)' }}>
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <button onClick={() => revoke(s.name)} style={{
                    padding: '2px 8px', border: '1px solid var(--border)', borderRadius: '3px',
                    background: 'transparent', color: 'var(--red)', fontSize: '0.7rem', cursor: 'pointer',
                  }}>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input placeholder="NAME" value={name} onChange={e => setName(e.target.value.toUpperCase())}
          style={{ ...inputStyle, width: '140px', fontFamily: 'var(--font-mono)' }} />
        <input placeholder="Value" type="password" value={value} onChange={e => setValue(e.target.value)}
          style={{ ...inputStyle, width: '180px' }} />
        <select value={scope} onChange={e => setScope(e.target.value)} style={{ ...inputStyle, width: '100px' }}>
          <option value="global">Global</option>
        </select>
        <button onClick={addSecret} style={{
          padding: '6px 12px', border: 'none', borderRadius: 'var(--radius-sm)',
          background: 'var(--purple)', color: 'white', fontSize: '0.8rem', cursor: 'pointer',
        }}>Add</button>
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: '4px' }}>{error}</p>}
    </section>
  );
}
