export type DarkCrazyhouseRoomTimeControl = {
  initialMs: number;
  incrementMs: number;
};

const DEFAULT_DARK_CRAZYHOUSE_TIME_CONTROL: DarkCrazyhouseRoomTimeControl = {
  initialMs: 180_000,
  incrementMs: 2_000,
};

export async function createDarkCrazyhousePlayAgainRoom(
  options: { timeControl?: DarkCrazyhouseRoomTimeControl | null } = {},
): Promise<string> {
  const timeControl =
    options.timeControl === null
      ? null
      : (options.timeControl ?? DEFAULT_DARK_CRAZYHOUSE_TIME_CONTROL);
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'pvp',
      gameSpecId: 'dark-crazyhouse',
      preferredColor: 'random',
      ...(timeControl ? { timeControl } : {}),
    }),
  });
  if (!response.ok) throw new Error(`room creation failed: ${response.status}`);
  const data = (await response.json()) as { url?: string };
  if (!data.url) throw new Error('room creation response missing url');
  return data.url;
}
