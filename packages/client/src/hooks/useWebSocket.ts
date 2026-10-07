import { useEffect, useRef, useState } from 'react';
import type { WsServerMessage } from '@konduktor/shared';
import { wsClient } from '../lib/ws';

export function useWebSocket(onMessage: (msg: WsServerMessage) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    wsClient.connect();
    setConnected(wsClient.connected);

    const unsub = wsClient.subscribe((msg) => {
      handlerRef.current(msg);
    });

    const unsubConn = wsClient.onConnectionChange(setConnected);

    return () => {
      unsub();
      unsubConn();
    };
  }, []);

  return { connected, send: wsClient.send.bind(wsClient) };
}
