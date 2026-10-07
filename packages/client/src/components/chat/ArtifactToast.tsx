import { useEffect } from 'react';

interface ToastData {
  id: number;
  title: string;
  icon: string;
  url: string | null;
}

export function ArtifactToast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 200,
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <span style={{ fontSize: '1.2rem' }}>{toast.icon || 'code'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--fg3)' }}>
          Artifact saved
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          {toast.title}
        </div>
      </div>
      {toast.url && (
        <a
          href="/artifacts"
          style={{
            fontSize: '0.7rem',
            color: 'var(--cyan)',
            textDecoration: 'none',
          }}
        >
          View
        </a>
      )}
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--fg3)',
          fontSize: '0.8rem',
        }}
      >
        {'✕'}
      </button>
    </div>
  );
}
