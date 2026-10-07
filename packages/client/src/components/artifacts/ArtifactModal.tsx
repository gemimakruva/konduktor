import { useState } from 'react';
import type { Artifact } from './types.js';

interface ArtifactModalProps {
  artifact: Artifact;
  onClose: () => void;
  onPin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

export function ArtifactModal({
  artifact,
  onClose,
  onPin,
  onDelete,
  onUpdate,
}: ArtifactModalProps) {
  const [tagInput, setTagInput] = useState('');
  const [iframeError, setIframeError] = useState(false);

  const addTag = async () => {
    if (!tagInput.trim()) return;
    const newTags = [...artifact.tags, tagInput.trim()];
    await fetch(`/api/artifacts/${artifact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    setTagInput('');
    onUpdate();
  };

  const removeTag = async (tag: string) => {
    const newTags = artifact.tags.filter((t) => t !== tag);
    await fetch(`/api/artifacts/${artifact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    onUpdate();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          width: '80vw',
          maxWidth: 900,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>{artifact.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {artifact.title}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg3)' }}>
              {artifact.description}
            </div>
          </div>
          <button
            onClick={() => onPin(artifact.id, !artifact.pinned)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              color: artifact.pinned ? 'var(--purple)' : 'var(--fg3)',
            }}
          >
            {artifact.pinned ? '★ Pinned' : '☆ Pin'}
          </button>
          {artifact.url && (
            <a
              href={artifact.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg)',
                fontSize: '0.7rem',
                color: 'var(--cyan)',
                textDecoration: 'none',
              }}
            >
              Open in Claude
            </a>
          )}
          <button
            onClick={() => {
              onDelete(artifact.id);
              onClose();
            }}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)',
              color: 'var(--red)',
              fontSize: '0.7rem',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              color: 'var(--fg3)',
            }}
          >
            {'✕'}
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', minHeight: 300 }}>
          {artifact.url && !iframeError ? (
            <iframe
              src={artifact.url}
              onError={() => setIframeError(true)}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-scripts allow-same-origin"
              title={artifact.title}
            />
          ) : (
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--fg3)',
                fontSize: '0.85rem',
              }}
            >
              {artifact.url ? (
                <>
                  <p>Preview unavailable.</p>
                  <a
                    href={artifact.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--cyan)' }}
                  >
                    Open in Claude
                  </a>
                </>
              ) : (
                <p>No URL available for this artifact.</p>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          {artifact.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--purple-soft)',
                color: 'var(--purple)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {t}
              <button
                onClick={() => removeTag(t)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.65rem',
                  color: 'var(--purple)',
                }}
              >
                {'✕'}
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add tag..."
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)',
              color: 'var(--fg)',
              width: 80,
            }}
          />
        </div>
      </div>
    </div>
  );
}
