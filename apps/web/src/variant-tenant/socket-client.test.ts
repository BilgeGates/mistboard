import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTenantSocketClient,
  type TenantSocketClientOptions,
  tenantReconnectDelayMs,
} from './socket-client.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  url: string;
  protocols?: string[];
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {}

  emit(type: string, event: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open', {});
  }

  message(payload: unknown): void {
    this.emit('message', { data: JSON.stringify(payload) });
  }

  closeWith(code: number, reason: string): void {
    this.emit('close', { code, reason });
  }
}

function makeClient(overrides: Partial<TenantSocketClientOptions> = {}) {
  const calls = {
    hello: [] as unknown[],
    snapshot: [] as unknown[],
    event: [] as unknown[],
    rematch: [] as unknown[],
    renders: 0,
  };
  const client = createTenantSocketClient({
    room: 'dchess_socket-test',
    applyHello: (frame) => calls.hello.push(frame),
    applySnapshot: (frame) => calls.snapshot.push(frame),
    applyEvent: (frame) => calls.event.push(frame),
    onRematchState: (message) => calls.rematch.push(message),
    render: () => {
      calls.renders += 1;
    },
    ...overrides,
  });
  return { client, calls };
}

function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error('no socket created');
  return socket;
}

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe('tenant socket client', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('caps reconnect backoff at 10 seconds', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(tenantReconnectDelayMs)).toEqual([
      750, 1_500, 3_000, 6_000, 10_000, 10_000, 10_000,
    ]);
  });

  it('connects, flips to connected on open, and sends only while open', () => {
    const { client } = makeClient();
    client.connect();
    expect(client.connection()).toBe('connecting');
    expect(client.send({ type: 'ping' })).toBe(false);
    lastSocket().open();
    expect(client.connection()).toBe('connected');
    expect(client.send({ type: 'ping', at: 1 })).toBe(true);
    expect(lastSocket().sent).toEqual([JSON.stringify({ type: 'ping', at: 1 })]);
  });

  it('maps duplicate-session and policy closes to terminal states without reconnecting', () => {
    const { client } = makeClient();
    client.connect();
    lastSocket().closeWith(4000, 'duplicate session');
    expect(client.connection()).toBe('displaced');
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    const rejected = makeClient().client;
    rejected.connect();
    lastSocket().closeWith(1008, 'private room');
    expect(rejected.connection()).toBe('rejected');
    expect(rejected.closeReason()).toBe('private room');
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('reconnects with backoff after an ordinary close', () => {
    const { client } = makeClient();
    client.connect();
    lastSocket().closeWith(1006, '');
    expect(client.connection()).toBe('reconnecting');
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(750);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('captures clientId and persists the seat token from hello', () => {
    const { client, calls } = makeClient();
    client.connect();
    lastSocket().open();
    lastSocket().message({
      type: 'hello',
      clientId: 'client-abc',
      seat: 'red',
      seatToken: 'a'.repeat(40),
    });
    expect(client.clientId()).toBe('client-abc');
    expect(calls.hello).toHaveLength(1);
    const stored = window.localStorage.getItem('mistboard.seatToken.dchess_socket-test');
    expect(stored).toContain('"seat":"red"');
    // The next connect attaches the stored token as the seat subprotocol.
    client.connect();
    expect(lastSocket().protocols).toEqual([`mistboard-seat.${'a'.repeat(40)}`]);
  });

  it('requests a fresh snapshot on an event sequence gap instead of applying it', () => {
    const { client, calls } = makeClient();
    client.connect();
    lastSocket().open();
    lastSocket().message({ type: 'snapshot', seat: 'white' });
    lastSocket().message({ type: 'event-appended', seq: 3, seat: 'white' });
    expect(calls.event).toHaveLength(1);
    lastSocket().message({ type: 'event-appended', seq: 7, seat: 'white' });
    expect(calls.event).toHaveLength(1);
    expect(lastSocket().sent).toContain(JSON.stringify({ type: 'snapshot:request' }));
    // A fresh snapshot resets the sequence and deltas flow again.
    lastSocket().message({ type: 'snapshot', seat: 'white' });
    lastSocket().message({ type: 'event-appended', seq: 8, seat: 'white' });
    expect(calls.event).toHaveLength(2);
  });

  it('routes rematch state to the tenant hook', () => {
    const { client, calls } = makeClient();
    client.connect();
    lastSocket().open();
    lastSocket().message({ type: 'rematch:state', offers: { white: true }, finalizedRoomId: null });
    expect(calls.rematch).toHaveLength(1);
    expect(calls.rematch[0]).toMatchObject({ offers: { white: true } });
  });
});
