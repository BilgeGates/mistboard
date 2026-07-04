export type XiangqiRoomTimeControl = {
  initialMs: number;
  incrementMs: number;
};

const DEFAULT_XIANGQI_TIME_CONTROL: XiangqiRoomTimeControl = {
  initialMs: 180_000,
  incrementMs: 2_000,
};

export async function createXiangqiPlayAgainRoom(
  options: { timeControl?: XiangqiRoomTimeControl | null } = {},
): Promise<string> {
  const timeControl =
    options.timeControl === null ? null : (options.timeControl ?? DEFAULT_XIANGQI_TIME_CONTROL);
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      gameSpecId: 'xiangqi',
      preferredColor: 'random',
      ...(timeControl ? { timeControl } : {}),
    }),
  });
  if (!response.ok) throw new Error(`room creation failed: ${response.status}`);
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error('room creation response missing url');
  return data.url;
}

export function xiangqiTimeControlFromEvents(
  events: readonly unknown[],
): XiangqiRoomTimeControl | null {
  const roomCreated = events.find(isXiangqiRoomCreatedWithTimeControl);
  return roomCreated?.timeControl ?? null;
}

function isXiangqiRoomCreatedWithTimeControl(
  value: unknown,
): value is { type: 'room-created'; timeControl: XiangqiRoomTimeControl } {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as { timeControl?: unknown; type?: unknown };
  if (event.type !== 'room-created') return false;
  return isXiangqiTimeControl(event.timeControl);
}

export function isXiangqiTimeControl(value: unknown): value is XiangqiRoomTimeControl {
  if (typeof value !== 'object' || value === null) return false;
  const timeControl = value as Partial<XiangqiRoomTimeControl>;
  return (
    typeof timeControl.initialMs === 'number' &&
    Number.isInteger(timeControl.initialMs) &&
    typeof timeControl.incrementMs === 'number' &&
    Number.isInteger(timeControl.incrementMs)
  );
}
