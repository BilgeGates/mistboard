/**
 * Name-preserving transport adapter for Dark Xiangqi over the generic tenant
 * ws runtime bundle (server-ws-dark-xiangqi.ts). The broadcast/send logic
 * itself lives in variant-tenant/ws.ts; this module keeps the pre-convergence
 * structural types (clients only need displaced/id/seat/socket) so transport
 * consumers and tests stay decoupled from the full live-client shape.
 */

import type { XiangqiColor } from '@mistboard/game';
import type { DarkXiangqiEvent, DarkXiangqiRuntimeRoom } from './dark-xiangqi-runtime.js';
import { type DarkXiangqiLiveClient, type DarkXiangqiLiveRoom, darkXiangqiWs } from './server-ws-dark-xiangqi.js';

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
  darkXiangqiWs.sendPayload(client as unknown as DarkXiangqiLiveClient, payload);
}

export function broadcastDarkXiangqiSnapshot(room: DarkXiangqiTransportRoom): void {
  darkXiangqiWs.broadcastSnapshot(room as unknown as DarkXiangqiLiveRoom);
}

export function darkXiangqiTransportSnapshotPayload(
  room: DarkXiangqiTransportRoom,
  client: DarkXiangqiTransportClient,
) {
  return darkXiangqiWs.transportSnapshotPayload(
    room as unknown as DarkXiangqiLiveRoom,
    client as unknown as DarkXiangqiLiveClient,
  );
}

export function broadcastDarkXiangqiEventAppended(
  room: DarkXiangqiTransportRoom,
  event: DarkXiangqiEvent,
  seq: number,
): void {
  darkXiangqiWs.broadcastEventAppended(room as unknown as DarkXiangqiLiveRoom, event, seq);
}

export function snapshotClientFor(client: DarkXiangqiTransportClient) {
  return {
    id: client.id,
    seat: client.seat,
    solo: false,
  };
}
