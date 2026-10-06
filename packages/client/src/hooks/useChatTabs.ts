import { useState, useCallback } from 'react';

export interface ChatTab {
  id: string;
  label: string;
  sessionId: string | null;
  createdAt: number;
}

export function useChatTabs() {
  const [tabs, setTabs] = useState<ChatTab[]>([
    { id: crypto.randomUUID(), label: 'Chat 1', sessionId: null, createdAt: Date.now() },
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const addTab = useCallback(() => {
    setTabs(prev => {
      const tab: ChatTab = {
        id: crypto.randomUUID(),
        label: `Chat ${prev.length + 1}`,
        sessionId: null,
        createdAt: Date.now(),
      };
      setActiveTabId(tab.id);
      return [...prev, tab];
    });
  }, []);

  const removeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const fresh: ChatTab = { id: crypto.randomUUID(), label: 'Chat 1', sessionId: null, createdAt: Date.now() };
        setActiveTabId(fresh.id);
        return [fresh];
      }
      setActiveTabId(curr => curr === id ? next[next.length - 1].id : curr);
      return next;
    });
  }, []);

  const switchTab = useCallback((id: string) => setActiveTabId(id), []);

  const updateTabSession = useCallback((tabId: string, sessionId: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, sessionId } : t
    ));
  }, []);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  return { tabs, activeTab, activeTabId, addTab, removeTab, switchTab, updateTabSession };
}
