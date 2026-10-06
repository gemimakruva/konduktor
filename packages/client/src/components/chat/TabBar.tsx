import type { ChatTab } from '../../hooks/useChatTabs';

interface Props {
  tabs: ChatTab[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, onNew }: Props) {
  return (
    <div style={{
      display: 'flex', gap: '2px', padding: '4px 0',
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto', minHeight: '36px',
    }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onSwitch(tab.id)} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 12px', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
          border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
          background: tab.id === activeTabId ? 'var(--bg-surface)' : 'transparent',
          color: tab.id === activeTabId ? 'var(--fg)' : 'var(--fg3)',
          borderBottom: tab.id === activeTabId ? '2px solid var(--purple)' : '2px solid transparent',
        }}>
          {tab.label}
          {tabs.length > 1 && (
            <span onClick={e => { e.stopPropagation(); onClose(tab.id); }} style={{
              fontSize: '0.7rem', color: 'var(--fg3)', cursor: 'pointer',
              padding: '0 2px', borderRadius: '2px',
            }}>x</span>
          )}
        </button>
      ))}
      <button onClick={onNew} style={{
        padding: '4px 10px', border: 'none', background: 'transparent',
        color: 'var(--fg3)', cursor: 'pointer', fontSize: '0.9rem',
      }}>+</button>
    </div>
  );
}
