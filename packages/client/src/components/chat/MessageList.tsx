import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@konduktor/shared';
import { StreamingText } from './StreamingText';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolUseBlock } from './ToolUseBlock';

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
          <MessageBody message={msg} />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBody({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant' || !message.blocks?.length) {
    if (message.isStreaming) return <StreamingText text={message.content} />;
    return (
      <div style={{
        fontSize: '0.875rem', lineHeight: 1.6,
        fontFamily: message.role === 'assistant' ? 'var(--font-mono)' : 'inherit',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {message.content}
      </div>
    );
  }

  return (
    <div>
      {message.blocks.map((block, i) => {
        if (block.type === 'thinking' && block.text) {
          return <ThinkingBlock key={i} text={block.text} />;
        }
        if (block.type === 'tool_use') {
          const nextBlock = message.blocks![i + 1];
          const result = nextBlock?.type === 'tool_result' ? nextBlock : undefined;
          return <ToolUseBlock key={i} block={block} result={result} />;
        }
        if (block.type === 'tool_result') {
          const prevBlock = message.blocks![i - 1];
          if (prevBlock?.type === 'tool_use') return null;
          return <ToolUseBlock key={i} block={{ type: 'tool_use', name: 'Tool' }} result={block} />;
        }
        if (block.type === 'text' && block.text) {
          return (
            <div key={i} style={{
              fontSize: '0.875rem', lineHeight: 1.6,
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {block.text}
            </div>
          );
        }
        return null;
      })}
      {message.isStreaming && (
        <span style={{
          display: 'inline-block', width: '2px', height: '1em',
          background: 'var(--purple)', marginLeft: '2px',
          animation: 'blink 1s step-end infinite',
        }} />
      )}
    </div>
  );
}
