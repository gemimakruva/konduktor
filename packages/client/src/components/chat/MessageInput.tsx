import { useState, type KeyboardEvent } from 'react';

interface Props {
  onSend: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function MessageInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: 'flex', gap: '8px', padding: '12px 0',
      borderTop: '1px solid var(--border)',
    }}>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled || isStreaming}
        rows={2}
        style={{
          flex: 1, padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          color: 'var(--fg)',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.875rem',
          resize: 'none',
          outline: 'none',
        }}
      />
      {isStreaming ? (
        <button
          onClick={onStop}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--red)',
            color: 'white',
            fontWeight: 600, fontSize: '0.875rem',
            cursor: 'pointer',
            alignSelf: 'flex-end',
          }}
        >
          Stop
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: disabled || !value.trim() ? 'var(--fg3)' : 'var(--purple)',
            color: 'white',
            fontWeight: 600, fontSize: '0.875rem',
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-end',
          }}
        >
          Send
        </button>
      )}
    </div>
  );
}
