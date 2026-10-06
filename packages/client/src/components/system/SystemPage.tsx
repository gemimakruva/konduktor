import { useState, useEffect } from 'react';

interface SystemInfo {
  node: string; platform: string; arch: string; hostname: string;
  osType: string; uptime: number; cpus: number;
  memory: { totalMb: number; freeMb: number };
  claude: { installed: boolean; version?: string; authenticated: boolean };
  konduktor: { version: string; pid: number; uptimeSeconds: number };
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}

export function SystemPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    const load = () => fetch('/api/system').then(r => r.json()).then(setInfo);
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (!info) return <p style={{ color: 'var(--fg3)' }}>Loading...</p>;

  const rows: [string, string][] = [
    ['Node.js', info.node],
    ['Platform', `${info.osType} ${info.platform} ${info.arch}`],
    ['Hostname', info.hostname],
    ['CPUs', String(info.cpus)],
    ['Memory', `${info.memory.freeMb} MB free / ${info.memory.totalMb} MB`],
    ['OS Uptime', fmtUptime(info.uptime)],
    ['Claude CLI', info.claude.installed ? `${info.claude.version} (${info.claude.authenticated ? 'authenticated' : 'not authenticated'})` : 'Not installed'],
    ['Konduktor', `v${info.konduktor.version} (pid ${info.konduktor.pid}, up ${fmtUptime(info.konduktor.uptimeSeconds)})`],
  ];

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>System</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', padding: '10px 14px',
            background: 'var(--bg-surface)', fontSize: '0.85rem',
          }}>
            <span style={{ width: 140, flexShrink: 0, fontWeight: 600, color: 'var(--fg2)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
