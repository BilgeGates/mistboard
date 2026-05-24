// Client-side variant registry — single source of truth for which variants are
// selectable in the lobby and shown on public rating surfaces (leaderboard +
// profile grid). Turning a variant on/off is a one-line edit here instead of
// hunting hardcoded lists across the UI.
//
// Note: this is the CLIENT registry. A variant that introduces a new server
// rating pool (e.g. Xiangqi) also needs the server-side pool added (rating
// bucket type + migration) as part of that variant's integration — the client
// registry doesn't substitute for that, it just centralizes the UI surface.

export type RatingVariantId = 'fog' | 'fog_draft960';

export interface VariantDef {
  id: RatingVariantId;
  /** `?variant=` value the leaderboard API expects. */
  apiParam: string;
  label: string;
  /** Selectable in the lobby variant picker. */
  enabled: boolean;
  /** Shown on the public leaderboard + profile rating grid. */
  onLeaderboard: boolean;
}

const draft960Enabled = import.meta.env.VITE_DRAFT960_ENABLED === 'true';

export const VARIANTS: VariantDef[] = [
  { id: 'fog', apiParam: 'fog', label: 'Dark chess', enabled: true, onLeaderboard: true },
  // Draft960: gated behind its flag, and temporarily hidden from the leaderboard
  // until it launches (sequenced to M4). Flip `onLeaderboard` (and the flag) when
  // expanding. Kept in the registry so re-enabling is one edit.
  {
    id: 'fog_draft960',
    apiParam: 'fog-draft960',
    label: 'Draft960',
    enabled: draft960Enabled,
    onLeaderboard: false,
  },
];

/** Variants shown on public rating surfaces (leaderboard + profile grid). */
export const leaderboardVariants = VARIANTS.filter((v) => v.onLeaderboard);

/** Variants selectable in the lobby. */
export const enabledVariants = VARIANTS.filter((v) => v.enabled);

export function isVariantEnabled(id: RatingVariantId): boolean {
  return VARIANTS.some((v) => v.id === id && v.enabled);
}
