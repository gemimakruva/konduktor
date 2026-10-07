import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Chat', icon: '>' },
  { to: '/sessions', label: 'Sessions', icon: '#' },
  { to: '/agents', label: 'Agents', icon: '&' },
  { to: '/capabilities', label: 'Capabilities', icon: '@' },
  { to: '/logs', label: 'Logs', icon: '~' },
  { to: '/system', label: 'System', icon: '?' },
  { to: '/kanban', label: 'Kanban', icon: '=' },
  { to: '/analytics', label: 'Analytics', icon: '%' },
  { to: '/settings', label: 'Settings', icon: '*' },
];

export function Sidebar() {
  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 'var(--sidebar-width)',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '16px 0',
    }}>
      <div style={{
        padding: '0 16px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <h1 style={{
          fontSize: '1.25rem', fontWeight: 700,
          background: 'var(--gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: 0,
        }}>
          Konduktor
        </h1>
        <p style={{ fontSize: '0.7rem', color: 'var(--fg3)', margin: '2px 0 0' }}>
          orchestrator for Claude Code
        </p>
      </div>
      <nav style={{ flex: 1, padding: '8px' }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 12px', borderRadius: 'var(--radius-md)',
              textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500,
              color: isActive ? 'var(--purple)' : 'var(--fg2)',
              background: isActive ? 'var(--purple-soft)' : 'transparent',
            })}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border)',
        fontSize: '0.7rem', color: 'var(--fg3)',
      }}>
        by Makruva
      </div>
    </aside>
  );
}
