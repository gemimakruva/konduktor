export function StreamingText({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: '0.875rem', lineHeight: 1.6,
      fontFamily: 'var(--font-mono)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {text}
      <span style={{
        display: 'inline-block',
        width: '2px', height: '1em',
        background: 'var(--purple)',
        marginLeft: '2px',
        animation: 'blink 1s step-end infinite',
      }} />
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}
