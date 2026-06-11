// Leaf URL helper: /room/:id (or bare /room in dev) to a room id. Kept free of
// imports so the variant-tenant registry's dynamic-import closures can't form
// module cycles through it.
export function roomIdFromPath(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '');
  if (normalized === '/room') return 'dev-room';
  const match = normalized.match(/^\/room\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}
