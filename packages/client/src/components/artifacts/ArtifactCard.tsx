interface ArtifactCardProps {
  artifact: {
    id: number;
    title: string;
    description: string;
    icon: string;
    url: string | null;
    tags: string[];
    pinned: boolean;
    createdAt: number;
  };
  onPin: (id: number, pinned: boolean) => void;
  onDelete: (id: number) => void;
  onClick: (id: number) => void;
}

export function ArtifactCard({
  artifact,
  onPin,
  onDelete,
  onClick,
}: ArtifactCardProps) {
  return (
    <div
      onClick={() => onClick(artifact.id)}
      style={{
        padding: '14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.15s',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>
          {artifact.icon || 'code'}
        </span>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '0.85rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {artifact.title}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--fg3)' }}>
            {new Date(artifact.createdAt).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPin(artifact.id, !artifact.pinned);
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: artifact.pinned ? 'var(--purple)' : 'var(--fg3)',
          }}
        >
          {artifact.pinned ? '★' : '☆'}
        </button>
      </div>
      {artifact.description && (
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--fg2)',
            margin: '0 0 8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {artifact.description}
        </p>
      )}
      {artifact.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {artifact.tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: '0.65rem',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--purple-soft)',
                color: 'var(--purple)',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(artifact.id);
        }}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.7rem',
          color: 'var(--fg3)',
        }}
      >
        {'✕'}
      </button>
    </div>
  );
}
