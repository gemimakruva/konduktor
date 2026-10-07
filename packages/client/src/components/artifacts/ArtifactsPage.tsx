import { useState, useEffect, useCallback } from 'react';
import { ArtifactCard } from './ArtifactCard';
import { ArtifactModal } from './ArtifactModal';
import type { Artifact } from './types';

export function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const qs = tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : '';
    try {
      setArtifacts(await (await fetch(`/api/artifacts${qs}`)).json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [tagFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const allTags = [...new Set(artifacts.flatMap((a) => a.tags))];

  const handlePin = async (id: number, pinned: boolean) => {
    await fetch(`/api/artifacts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    refresh();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/artifacts/${id}`, { method: 'DELETE' });
    refresh();
  };

  const selected = artifacts.find((a) => a.id === selectedId);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>Artifacts</h2>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setTagFilter('')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.7rem',
                background: !tagFilter ? 'var(--purple)' : 'var(--bg-surface)',
                color: !tagFilter ? 'white' : 'var(--fg3)',
              }}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  background:
                    tagFilter === t ? 'var(--purple)' : 'var(--bg-surface)',
                  color: tagFilter === t ? 'white' : 'var(--fg3)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <p style={{ color: 'var(--fg3)', fontSize: '0.8rem' }}>Loading...</p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '10px',
        }}
      >
        {artifacts.map((a) => (
          <ArtifactCard
            key={a.id}
            artifact={a}
            onPin={handlePin}
            onDelete={handleDelete}
            onClick={setSelectedId}
          />
        ))}
      </div>

      {!loading && artifacts.length === 0 && (
        <p
          style={{
            color: 'var(--fg3)',
            fontSize: '0.8rem',
            textAlign: 'center',
            padding: '40px 0',
          }}
        >
          No artifacts yet. Artifacts created during chat sessions will appear
          here.
        </p>
      )}

      {selected && (
        <ArtifactModal
          artifact={selected}
          onClose={() => setSelectedId(null)}
          onPin={handlePin}
          onDelete={handleDelete}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
