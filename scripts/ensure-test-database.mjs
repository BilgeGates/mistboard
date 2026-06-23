#!/usr/bin/env node

import pg from 'pg';

export const DEFAULT_TEST_DATABASE_URL =
  'postgres://mistboard:mistboard@localhost:5435/mistboard_test';

const DEFAULT_MAINTENANCE_DATABASE_URL = 'postgres://mistboard:mistboard@localhost:5435/mistboard';

export async function ensureTestDatabase({
  databaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
  maintenanceDatabaseUrl = process.env.MISTBOARD_TEST_MAINTENANCE_DATABASE_URL ??
    DEFAULT_MAINTENANCE_DATABASE_URL,
} = {}) {
  const target = databaseNameFromUrl(databaseUrl, 'TEST_DATABASE_URL');
  const maintenance = new pg.Client({ connectionString: maintenanceDatabaseUrl });
  await maintenance.connect();
  try {
    const existing = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      target,
    ]);
    if (existing.rowCount === 0) {
      await maintenance.query(`CREATE DATABASE ${quoteIdentifier(target)}`);
      console.log(`created test database ${target}`);
    } else {
      console.log(`test database ${target} is ready`);
    }
  } finally {
    await maintenance.end();
  }
}

function databaseNameFromUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid Postgres URL`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!database) throw new Error(`${label} must include a database name`);
  return database;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await ensureTestDatabase();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
