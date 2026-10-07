import { useState, useCallback } from 'react';
import type { ChatMessage, WsServerMessage, StreamEvent, Artifact } from '@konduktor/shared';
import { useWebSocket } from './useWebSocket';

export interface ArtifactToastData {
  id: number;
  title: string;
  icon: string;
  url: string | null;
}

export function useChat(tabSessionId: string | null = null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(tabSessionId);
  const [artifactToast, setArtifactToast] = useState<ArtifactToastData | null>(null);

  const handleMessage = useCallback((msg: WsServerMessage) => {
    if (msg.type === 'artifact:saved') {
      const a = msg.artifact;
      setArtifactToast({ id: a.id, title: a.title, icon: a.icon, url: a.url });
      return;
    }

    if (msg.type === 'chat:stream') {
      if (activeSessionId && msg.sessionId !== activeSessionId) return;
      setIsStreaming(true);
      setActiveSessionId(msg.sessionId);
      const event = msg.event as StreamEvent;

      if (event.type === 'assistant' && event.content) {
        const text = event.content
          .filter(b => b.type === 'text' && b.text)
          .map(b => b.text)
          .join('');
        if (!text) return;

        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.isStreaming) {
            return [...prev.slice(0, -1), { ...last, content: last.content + text }];
          }
          return [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: text,
            timestamp: Date.now(),
            isStreaming: true,
          }];
        });
      }
    }

    if (msg.type === 'chat:end') {
      setIsStreaming(false);
      setMessages(prev => prev.map(m =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      ));
    }

    if (msg.type === 'chat:error') {
      setIsStreaming(false);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system' as const,
        content: `Error: ${msg.error}`,
        timestamp: Date.now(),
      }]);
    }

    if (msg.type === 'chat:history') {
      setMessages(msg.messages);
    }

    if (msg.type === 'chat:replay') {
      for (const event of msg.events) {
        if (event.type === 'assistant' && event.content) {
          const text = event.content
            .filter(b => b.type === 'text' && b.text)
            .map(b => b.text)
            .join('');
          if (text) {
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: text,
              timestamp: Date.now(),
            }]);
          }
        }
      }
    }
  }, [activeSessionId]);

  const { connected, send } = useWebSocket(handleMessage);

  const sendMessage = useCallback((prompt: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: prompt,
      timestamp: Date.now(),
    }]);

    if (activeSessionId) {
      send({ type: 'chat:message', sessionId: activeSessionId, prompt });
    } else {
      send({ type: 'chat:start', prompt });
    }
  }, [send, activeSessionId]);

  const stopChat = useCallback(() => {
    if (activeSessionId) {
      send({ type: 'chat:stop', sessionId: activeSessionId });
    }
  }, [send, activeSessionId]);

  const dismissArtifactToast = useCallback(() => setArtifactToast(null), []);

  return { messages, isStreaming, connected, sendMessage, stopChat, activeSessionId, artifactToast, dismissArtifactToast };
}
