import pg from 'pg';

let pool: pg.Pool | null = null;

export function init(connectionString: string): void {
  if (pool) throw new Error('persistence already initialized');
  pool = new pg.Pool({
    connectionString,
    max: 10,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export async function probeDb(): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function close(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export function isInitialized(): boolean {
  return pool !== null;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('persistence not initialized — call init(connectionString) first');
  return pool;
}

// Run `fn` inside a single BEGIN/COMMIT transaction on a dedicated pooled
// client. Commits when `fn` resolves, rolls back when it throws (the ROLLBACK
// is itself guarded so a rollback failure can't mask the original error), and
// always releases the client. Read-only early returns are safe to commit.
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
