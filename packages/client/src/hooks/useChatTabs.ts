import { useState, useCallback, useEffect } from 'react';

export interface ChatTab {
  id: string;
  label: string;
  sessionId: string | null;
  createdAt: number;
}

const STORAGE_KEY = 'konduktor-chat-tabs';

function loadPersistedTabs(): { tabs: ChatTab[]; activeTabId: string } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.tabs?.length > 0) return data;
    }
  } catch { /* ignore */ }
  const tab: ChatTab = { id: crypto.randomUUID(), label: 'Chat 1', sessionId: null, createdAt: Date.now() };
  return { tabs: [tab], activeTabId: tab.id };
}

export function useChatTabs() {
  const [initial] = useState(loadPersistedTabs);
  const [tabs, setTabs] = useState<ChatTab[]>(initial.tabs);
  const [activeTabId, setActiveTabId] = useState(initial.activeTabId);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId })); } catch { /* ignore */ }
  }, [tabs, activeTabId]);

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
