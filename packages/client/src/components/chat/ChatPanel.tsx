import { useEffect } from 'react';
import { useChat } from '../../hooks/useChat';
import { useNotifications } from '../../hooks/useNotifications';
import { useChatTabs } from '../../hooks/useChatTabs';
import { TabBar } from './TabBar';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ArtifactToast } from './ArtifactToast';

export function ChatPanel() {
  const { tabs, activeTab, activeTabId, addTab, removeTab, switchTab, updateTabSession } = useChatTabs();
  const {
    messages, isStreaming, connected, sendMessage, stopChat, activeSessionId,
    artifactToast, dismissArtifactToast,
    lastCompletedResult, setLastCompletedResult,
    cronCompletion, setCronCompletion,
  } = useChat(activeTab.sessionId);
  const { notify } = useNotifications();

  useEffect(() => {
    if (lastCompletedResult) {
      notify('Session completed', lastCompletedResult);
      setLastCompletedResult(null);
    }
  }, [lastCompletedResult, notify, setLastCompletedResult]);

  useEffect(() => {
    if (cronCompletion) {
      notify('Cron job completed', `${cronCompletion.jobName} — ${cronCompletion.status}`);
      setCronCompletion(null);
    }
  }, [cronCompletion, notify, setCronCompletion]);

  useEffect(() => {
    if (activeSessionId && activeTab.sessionId !== activeSessionId) {
      updateTabSession(activeTabId, activeSessionId);
    }
  }, [activeSessionId, activeTab.sessionId, activeTabId, updateTabSession]);

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
      {artifactToast && <ArtifactToast toast={artifactToast} onDismiss={dismissArtifactToast} />}
    </div>
  );
}
