/**
 * Generic live-room WebSocket client for variant tenants — the tenant-side
 * socket host of the Layer-3 extraction, extracted from the Crossroads Chess
 * self-contained client (the deliberate sibling of the chess liveState shell).
 *
 * Owns everything connection-shaped and tenant-agnostic: the connection state
 * machine (connecting/connected/reconnecting/displaced/rejected with the
 * server's close-code semantics), exponential-backoff reconnects, the
 * seat-token subprotocol attach + persistence on hello, rematch:redirect
 * token hand-off + navigation, event-appended sequence-gap detection with
 * snapshot:request resync, and the ping loop. Frame APPLICATION stays
 * tenant-owned through the apply* hooks; `render` is invoked after every
 * state change exactly where the pre-extraction client re-rendered.
 *
 * The chess/DMX liveState shell still owns its own socket (live-socket.ts);
 * converging it onto this client is the P2 step.
 */

import {
  clientIdForRoom,
  isPlayableSeat,
  resolveWebSocketBaseUrl,
  seatTokenForRoom,
  writeSeatTokenForRoom,
} from '../live-state.js';

export type TenantConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'displaced'
  | 'rejected';

// The generic slice of a hello/snapshot/event-appended frame the client reads;
// tenants cast to their full frame type inside the apply hooks.
export type TenantSocketFrame = {
  type: 'hello' | 'snapshot' | 'event-appended';
  clientId?: string;
  seatToken?: string;
  seat?: unknown;
  seq?: number;
};

type TenantServerMessage =
  | TenantSocketFrame
  | { type: 'pong'; at: number; serverAt?: number }
  | { type: 'rematch:state' }
  | { type: 'rematch:redirect'; url: string; roomId: string; seat: unknown; seatToken: string };

export type TenantSocketClientOptions = {
  room: string;
  // Tenant frame application. The client has already handled clientId capture,
  // seat-token persistence, sequence bookkeeping, and the connected flip.
  applyHello(frame: TenantSocketFrame): void;
  applySnapshot(frame: TenantSocketFrame): void;
  applyEvent(frame: TenantSocketFrame): void;
  onRematchState?(message: Record<string, unknown>): void;
  // Full re-render, called after every connection/frame state change.
  render(): void;
};

export type TenantSocketClient = {
  connect(): void;
  send(payload: unknown): boolean;
  startPing(intervalMs?: number): void;
  connection(): TenantConnectionState;
  closeReason(): string;
  clientId(): string;
};

export function createTenantSocketClient(options: TenantSocketClientOptions): TenantSocketClient {
  const socketParams = new URLSearchParams({ room: options.room });
  socketParams.set('client', clientIdForRoom(options.room));
  const socketUrl = `${resolveWebSocketBaseUrl()}?${socketParams}`;

  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let reconnectAttempt = 0;
  let lastSeq: number | null = null;
  let clientId = '';
  let connectionState: TenantConnectionState = 'connecting';
  let closeReason = '';

  function connect(): void {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.removeEventListener('message', onMessage);
      socket.close();
      socket = null;
    }
    connectionState = clientId ? 'reconnecting' : 'connecting';
    options.render();

    const token = seatTokenForRoom(options.room);
    const next = token
      ? new WebSocket(socketUrl, [`mistboard-seat.${token}`])
      : new WebSocket(socketUrl);
    socket = next;
    next.addEventListener('message', onMessage);
    next.addEventListener('open', () => {
      if (socket !== next) return;
      reconnectAttempt = 0;
      connectionState = 'connected';
      options.render();
    });
    next.addEventListener('close', (event) => {
      if (socket !== next) return;
      closeReason = event.reason;
      if (event.code === 4000 && event.reason === 'duplicate session') {
        connectionState = 'displaced';
        socket = null;
        options.render();
        return;
      }
      if (event.code === 1008) {
        connectionState = 'rejected';
        socket = null;
        options.render();
        return;
      }
      connectionState = 'reconnecting';
      options.render();
      scheduleReconnect();
    });
    next.addEventListener('error', () => {
      if (socket !== next) return;
      connectionState = 'reconnecting';
      options.render();
    });
  }

  function scheduleReconnect(): void {
    if (connectionState === 'displaced' || connectionState === 'rejected') return;
    if (reconnectTimer) return;
    reconnectAttempt += 1;
    const delay = tenantReconnectDelayMs(reconnectAttempt);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function send(payload: unknown): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function onMessage(event: MessageEvent<string>): void {
    const message = JSON.parse(event.data) as TenantServerMessage;
    if (message.type === 'pong') return;
    if (message.type === 'rematch:state') {
      options.onRematchState?.(message as unknown as Record<string, unknown>);
      options.render();
      return;
    }
    if (message.type === 'rematch:redirect') {
      if (isPlayableSeat(message.seat)) {
        writeSeatTokenForRoom(message.roomId, { seat: message.seat, token: message.seatToken });
      }
      window.location.assign(message.url);
      return;
    }

    if (message.type === 'hello') {
      connectionState = 'connected';
      clientId = message.clientId ?? clientId;
      if (message.seatToken && isPlayableSeat(message.seat)) {
        writeSeatTokenForRoom(options.room, { seat: message.seat, token: message.seatToken });
      }
      options.applyHello(message);
      lastSeq = null;
    } else if (message.type === 'snapshot') {
      connectionState = 'connected';
      options.applySnapshot(message);
      lastSeq = null;
    } else if (message.type === 'event-appended') {
      // Gap detection: a missed delta means resync from a fresh snapshot.
      if (lastSeq !== null && message.seq !== undefined && message.seq !== lastSeq + 1) {
        send({ type: 'snapshot:request' });
        return;
      }
      connectionState = 'connected';
      options.applyEvent(message);
      if (message.seq !== undefined) lastSeq = message.seq;
    }
    options.render();
  }

  function startPing(intervalMs = 5_000): void {
    window.setInterval(() => send({ type: 'ping', at: Date.now() }), intervalMs);
  }

  return {
    connect,
    send,
    startPing,
    connection: () => connectionState,
    closeReason: () => closeReason,
    clientId: () => clientId,
  };
}

// Exponential backoff capped at 10s: 750ms, 1.5s, 3s, 6s, 10s, 10s, ...
export function tenantReconnectDelayMs(attempt: number): number {
  return Math.min(10_000, 750 * 2 ** Math.min(attempt - 1, 4));
}
