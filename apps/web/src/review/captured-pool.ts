import './captured-pool.css';

// Generic captured-material pool for review surfaces whose board renderer is not
// the stored xiangqi glyph set that banqi's `fillCapturedPool` hardcodes — the
// jungle family (animal tokens) and dark xiangqi (character glyphs). The caller
// supplies the single-piece renderer so the pool always matches its own board.
// Repeats of a role collapse to one glyph + a count badge so a full pool stays
// inside the board width. The caller clears the host (per strip) before filling.

export function fillCapturedPoolWith<Color extends string, Role extends string>(
  host: HTMLElement,
  captured: ReadonlyArray<{ owner: Color; role: Role }>,
  owner: Color,
  renderPiece: (entry: { color: Color; role: Role }) => string,
): void {
  const mine = captured.filter((entry) => entry.owner === owner);
  host.classList.toggle('has-captures', mine.length > 0);
  if (mine.length === 0) return;
  const order: Role[] = [];
  const counts = new Map<Role, number>();
  for (const entry of mine) {
    if (!counts.has(entry.role)) order.push(entry.role);
    counts.set(entry.role, (counts.get(entry.role) ?? 0) + 1);
  }
  const row = document.createElement('div');
  row.className = 'captures-row review-captures-row';
  for (const role of order) {
    const count = counts.get(role) ?? 1;
    const span = document.createElement('span');
    span.className = count > 1 ? 'review-capture-piece has-count' : 'review-capture-piece';
    span.setAttribute('aria-label', count > 1 ? `${owner} ${role} x${count}` : `${owner} ${role}`);
    span.innerHTML = renderPiece({ color: owner, role });
    if (count > 1) {
      const badge = document.createElement('span');
      badge.className = 'captures-count-badge';
      badge.textContent = String(count);
      badge.setAttribute('aria-hidden', 'true');
      span.append(badge);
    }
    row.append(span);
  }
  host.append(row);
}
