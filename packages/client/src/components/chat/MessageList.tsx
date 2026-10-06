import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@konduktor/shared';
import { StreamingText } from './StreamingText';

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--fg3)', fontSize: '0.9rem',
      }}>
        Start a conversation with Claude Code
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
      {messages.map(msg => (
        <div key={msg.id} style={{
          padding: '12px 16px', marginBottom: '8px',
          borderRadius: 'var(--radius-md)',
          background: msg.role === 'user' ? 'var(--purple-soft)' : msg.role === 'system' ? 'var(--red-soft)' : 'var(--bg-raised)',
        }}>
          <div style={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--fg3)',
            marginBottom: '4px', textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {msg.role}
          </div>
          {msg.isStreaming ? (
            <StreamingText text={msg.content} />
          ) : (
            <div style={{
              fontSize: '0.875rem', lineHeight: 1.6,
              fontFamily: msg.role === 'assistant' ? 'var(--font-mono)' : 'inherit',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
