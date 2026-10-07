import { useState } from 'react';
import type { ContentBlock } from '@konduktor/shared';
import { getToolSummary } from './tool-summary';

interface ToolUseBlockProps {
  block: ContentBlock;
  result?: ContentBlock;
}

export function ToolUseBlock({ block, result }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = getToolSummary(block.name || 'Tool', block.input);
  const hasResult = result?.text !== undefined;

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
          color: 'var(--cyan)',
          textAlign: 'left',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{
          display: 'inline-block',
          transition: 'transform 0.15s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: '0.6rem',
        }}>{'▶'}</span>
        {summary}
        {!hasResult && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '0.65rem',
            color: 'var(--fg3)',
          }}>
            running...
          </span>
        )}
      </button>
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          maxHeight: 250,
          overflowY: 'auto',
        }}>
          {block.input && (
            <div style={{
              padding: '6px 10px',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: 'var(--fg3)',
                marginBottom: '2px',
              }}>
                INPUT
              </div>
              <pre style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--fg2)',
                margin: 0,
              }}>
                {JSON.stringify(block.input, null, 2)}
              </pre>
            </div>
          )}
          {hasResult && (
            <div style={{ padding: '6px 10px' }}>
              <div style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: 'var(--fg3)',
                marginBottom: '2px',
              }}>
                RESULT
              </div>
              <pre style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--fg2)',
                margin: 0,
              }}>
                {result!.text}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
