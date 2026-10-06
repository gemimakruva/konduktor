import { useState } from 'react';
import { McpTab } from './McpTab';
import { PluginsTab } from './PluginsTab';

const TABS = ['MCP Servers', 'Plugins'] as const;

export function CapabilitiesPage() {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('MCP Servers');

  return (
    <div>
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>Capabilities</h2>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '6px 14px', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
            border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
            background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
            color: activeTab === tab ? 'var(--fg)' : 'var(--fg3)',
            borderBottom: activeTab === tab ? '2px solid var(--purple)' : '2px solid transparent',
          }}>{tab}</button>
        ))}
      </div>
      {activeTab === 'MCP Servers' && <McpTab />}
      {activeTab === 'Plugins' && <PluginsTab />}
    </div>
  );
}
