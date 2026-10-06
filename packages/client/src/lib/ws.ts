import type { WsClientMessage, WsServerMessage } from '@konduktor/shared';
import { LIMITS } from '@konduktor/shared';

type MessageHandler = (msg: WsServerMessage) => void;

class WsClient {
  private socket: WebSocket | null = null;
  private handlers = new Set<MessageHandler>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventIndex = new Map<string, number>();
  private activeSessionId: string | null = null;

  connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.activeSessionId) {
        const lastIdx = this.lastEventIndex.get(this.activeSessionId) ?? 0;
        this.send({ type: 'chat:reconnect', sessionId: this.activeSessionId, lastEventIndex: lastIdx });
      }
    };

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as WsServerMessage;
      if (msg.type === 'chat:stream' && msg.eventIndex !== undefined) {
        this.lastEventIndex.set(msg.sessionId, msg.eventIndex);
        this.activeSessionId = msg.sessionId;
      }
      this.handlers.forEach(h => h(msg));
    };

    this.socket.onclose = () => {
      this.tryReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts >= LIMITS.wsMaxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = LIMITS.wsReconnectDelayMs * Math.min(this.reconnectAttempts, 5);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(msg: WsClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = LIMITS.wsMaxReconnectAttempts;
    this.socket?.close();
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WsClient();
