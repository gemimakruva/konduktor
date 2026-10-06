import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@konduktor/shared';

const API = '/api/sessions';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API);
      setSessions(await res.json());
    } catch { /* network error — keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const stopSession = useCallback(async (id: string) => {
    await fetch(`${API}/${id}/stop`, { method: 'POST' });
    refresh();
  }, [refresh]);

  const removeSession = useCallback(async (id: string) => {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    refresh();
  }, [refresh]);

  return { sessions, loading, refresh, stopSession, removeSession };
}
