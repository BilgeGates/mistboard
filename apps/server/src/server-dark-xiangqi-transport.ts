import type { XiangqiColor } from '@mistboard/game';
import {
  type DarkXiangqiEvent,
  type DarkXiangqiRuntimeRoom,
  darkXiangqiSnapshotPayload,
} from './dark-xiangqi-runtime.js';

export type DarkXiangqiTransportClient = {
  displaced: boolean;
  id: string;
  seat: XiangqiColor;
  socket: { send(payload: string): unknown };
};

export type DarkXiangqiTransportRoom<
  Client extends DarkXiangqiTransportClient = DarkXiangqiTransportClient,
> = Omit<DarkXiangqiRuntimeRoom, 'clients'> & {
  clients: Set<Client>;
};

export function sendDarkXiangqiPayload(client: DarkXiangqiTransportClient, payload: unknown): void {
  if (client.displaced) return;
  try {
    client.socket.send(JSON.stringify(payload));
  } catch {
    /* socket closed */
  }
}

export function broadcastDarkXiangqiSnapshot(room: DarkXiangqiTransportRoom): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    sendDarkXiangqiPayload(client, darkXiangqiTransportSnapshotPayload(room, client));
  }
}

export function darkXiangqiTransportSnapshotPayload(
  room: DarkXiangqiTransportRoom,
  client: DarkXiangqiTransportClient,
) {
  return darkXiangqiSnapshotPayload(room, snapshotClientFor(client));
}

export function broadcastDarkXiangqiEventAppended(
  room: DarkXiangqiTransportRoom,
  event: DarkXiangqiEvent,
  seq: number,
): void {
  for (const client of room.clients) {
    if (client.displaced) continue;
    if (room.projection.state.status.type !== 'playing') {
      sendDarkXiangqiPayload(client, darkXiangqiTransportSnapshotPayload(room, client));
      continue;
    }
    const snapshot = darkXiangqiTransportSnapshotPayload(room, client);
    const { events: _events, ...base } = snapshot;
    const eventVisible = event.type !== 'move-played' || event.color === client.seat;
    sendDarkXiangqiPayload(client, {
      ...base,
      type: 'event-appended',
      seq,
      ...(eventVisible ? { event } : {}),
    });
  }
}

export function snapshotClientFor(client: DarkXiangqiTransportClient) {
  return {
    id: client.id,
    seat: client.seat,
    solo: false,
  };
}
