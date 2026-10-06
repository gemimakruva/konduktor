import { useChat } from '../../hooks/useChat';
import { useChatTabs } from '../../hooks/useChatTabs';
import { TabBar } from './TabBar';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export function ChatPanel() {
  const { tabs, activeTab, activeTabId, addTab, removeTab, switchTab } = useChatTabs();
  const { messages, isStreaming, connected, sendMessage, stopChat } = useChat(activeTab.sessionId);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 32px)',
    }}>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={switchTab}
        onClose={removeTab}
        onNew={addTab}
      />
      <div style={{
        padding: '12px 0', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: connected ? 'var(--green)' : 'var(--red)',
        }} />
        <span style={{ fontSize: '0.8rem', color: 'var(--fg3)' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <MessageList messages={messages} />
      <MessageInput
        onSend={sendMessage}
        onStop={stopChat}
        isStreaming={isStreaming}
        disabled={!connected}
      />
    </div>
  );
}
