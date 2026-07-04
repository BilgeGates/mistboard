import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { routes } from './http-api.js';

// Fail-closed conformance backstop for the http-api dispatch array.
//
// Every postgame games route lives in a routes/<variant>-games.ts module that
// exports `tryHandle`, and every such module MUST be added to the `routes`
// array in http-api.ts or its /api/<variant>/games/:id endpoint silently 404s
// in production (a new variant's route file typechecks fine but never runs).
// That exact bug shipped standard Xiangqi's postgame page dead in prod. The
// dispatch array is a hand-maintained mirror with no compile-time enforcement,
// so this test enumerates the route files and asserts each is wired in — the
// same fail-closed pattern the request gate and registry-sync tests apply to
// the other dispatch surfaces.

const routesDir = join(dirname(fileURLToPath(import.meta.url)), 'routes');

test('every routes/*-games.ts module is registered in the http-api dispatch', async () => {
  const gameRouteFiles = readdirSync(routesDir)
    .filter((file) => file.endsWith('-games.ts') && !file.endsWith('.test.ts'))
    .sort();
  assert.ok(gameRouteFiles.length > 0, 'expected to discover games-route modules under routes/');

  // Identity by the tryHandle function reference (stable regardless of how the
  // module namespace object is obtained), not by array membership of the ns.
  const registered = new Set(routes.map((route) => route.tryHandle));

  const unregistered: string[] = [];
  for (const file of gameRouteFiles) {
    const mod = (await import(join(routesDir, file.replace(/\.ts$/, '.js')))) as {
      tryHandle?: unknown;
    };
    assert.equal(
      typeof mod.tryHandle,
      'function',
      `${file} does not export tryHandle — every games route must implement the RouteModule contract`,
    );
    if (!registered.has(mod.tryHandle as (typeof routes)[number]['tryHandle'])) {
      unregistered.push(file);
    }
  }

  assert.deepEqual(
    unregistered,
    [],
    `these games-route modules exist but are NOT wired into http-api.ts's routes[] dispatch array, so their /api/<variant>/games/:id endpoint 404s in production: ${unregistered.join(', ')}. Import the module and add it to the routes array in http-api.ts.`,
  );
});
