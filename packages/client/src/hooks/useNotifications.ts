import { useState, useCallback, useEffect } from 'react';

export function useNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  useEffect(() => {
    const fetchEnabled = () =>
      fetch('/api/settings')
        .then(r => r.json())
        .then(s => setEnabled(!!s.desktopNotifications))
        .catch(() => {});
    fetchEnabled();
    const handler = () => fetchEnabled();
    window.addEventListener('settings-changed', handler);
    return () => window.removeEventListener('settings-changed', handler);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (!enabled || permission !== 'granted') return;
    if (typeof Notification === 'undefined') return;
    if (document.hasFocus()) return;
    new Notification(title, { body, icon: '/favicon.ico' });
  }, [enabled, permission]);

  return { enabled, setEnabled, permission, requestPermission, notify };
}
