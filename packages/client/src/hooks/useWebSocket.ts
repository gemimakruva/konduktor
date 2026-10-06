import { useEffect, useRef, useState } from 'react';
import type { WsServerMessage } from '@konduktor/shared';
import { wsClient } from '../lib/ws';

export function useWebSocket(onMessage: (msg: WsServerMessage) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    wsClient.connect();

    const unsub = wsClient.subscribe((msg) => {
      handlerRef.current(msg);
    });

    const interval = setInterval(() => {
      setConnected(wsClient.connected);
    }, 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  return { connected, send: wsClient.send.bind(wsClient) };
}
