import { useState } from 'react';

export function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      margin: '4px 0',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '6px 10px',
          background: 'var(--bg-surface)',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--fg3)',
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 0.15s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: '0.6rem',
        }}>{'▶'}</span>
        Thinking...
      </button>
      {expanded && (
        <div style={{
          padding: '8px 10px',
          fontSize: '0.8rem',
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'var(--fg3)',
          maxHeight: 300,
          overflowY: 'auto',
          borderTop: '1px solid var(--border)',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}
