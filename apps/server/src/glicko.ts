// Glicko-2 rating system (Glickman 2013).
//
// Replaces the fixed-K Elo in elo.ts for the human PvP ladder. Self-calibrates
// via rating deviation (RD): new players have high RD and their rating moves
// fast, then stabilizes as games accumulate — so no offline "calibrate after N
// games" step is needed before the system can be trusted live.
//
// Public scale is the familiar rating space (default 1500, RD 350). Conversion
// to/from the internal Glicko-2 scale (mu/phi) happens inside this module; the
// rest of the codebase only ever sees {rating, rd, volatility}.
//
// Correctness is pinned by glicko.test.ts against Glickman's published worked
// example, so this is verifiable, not vibes.

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;

// System constant constraining volatility change. Lower = ratings respond more
// smoothly to upsets. 0.5 is a reasonable default; tune against real games.
const TAU = 0.5;

// Glicko-2 scale factor (mu = (rating - 1500) / 173.7178).
const SCALE = 173.7178;

// Volatility-iteration convergence tolerance (Glickman uses 1e-6).
const CONVERGENCE = 1e-6;

// RD above this is shown as provisional ("?") and excluded from the leaderboard
// (lichess uses ~110). Lives here so display and ranking agree on one threshold.
export const PROVISIONAL_RD = 110;

export interface Glicko2 {
  rating: number;
  rd: number;
  volatility: number;
}

/** One game's outcome from the rated player's perspective. score: win=1, draw=0.5, loss=0. */
export interface GameOutcome {
  opponentRating: number;
  opponentRd: number;
  score: number;
}

export function defaultRating(): Glicko2 {
  return { rating: DEFAULT_RATING, rd: DEFAULT_RD, volatility: DEFAULT_VOLATILITY };
}

/** A rating is provisional until the system is confident (RD below the threshold). */
export function isProvisional(rd: number): boolean {
  return rd > PROVISIONAL_RD;
}

/**
 * Conservative rating for leaderboard ranking: rating - 2*RD. A high-RD player
 * can't outrank a settled player on noise alone (lichess uses this ordering).
 */
export function conservativeRating(r: Glicko2): number {
  return r.rating - 2 * r.rd;
}

/**
 * Rate a player over a rating period containing `outcomes` games. For the
 * online (per-game) model, pass a single-element array. Empty array = an
 * inactive period: rating unchanged, RD inflates by volatility (capped at the
 * default), modeling growing uncertainty during a layoff.
 */
export function rate(player: Glicko2, outcomes: GameOutcome[]): Glicko2 {
  if (outcomes.length === 0) return rateInactive(player);

  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.volatility;

  // Estimated variance (v) and the rating-change direction sum.
  let vInv = 0;
  let deltaSum = 0;
  for (const o of outcomes) {
    const muJ = toMu(o.opponentRating);
    const phiJ = toPhi(o.opponentRd);
    const g = gFn(phiJ);
    const e = eFn(mu, muJ, phiJ);
    vInv += g * g * e * (1 - e);
    deltaSum += g * (o.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  const sigmaPrime = newVolatility(phi, sigma, delta, v);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: fromMu(muPrime),
    rd: fromPhi(phiPrime),
    volatility: sigmaPrime,
  };
}

/** Apply RD inflation for `periods` of inactivity without altering rating. */
export function decayInactive(player: Glicko2, periods = 1): Glicko2 {
  let result = player;
  for (let i = 0; i < periods; i++) result = rateInactive(result);
  return result;
}

function rateInactive(player: Glicko2): Glicko2 {
  const phi = toPhi(player.rd);
  const phiStar = Math.sqrt(phi * phi + player.volatility * player.volatility);
  return {
    rating: player.rating,
    rd: Math.min(fromPhi(phiStar), DEFAULT_RD),
    volatility: player.volatility,
  };
}

function toMu(rating: number): number {
  return (rating - DEFAULT_RATING) / SCALE;
}
function toPhi(rd: number): number {
  return rd / SCALE;
}
function fromMu(mu: number): number {
  return SCALE * mu + DEFAULT_RATING;
}
function fromPhi(phi: number): number {
  return SCALE * phi;
}

function gFn(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function eFn(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-gFn(phiJ) * (mu - muJ)));
}

// New volatility via the Illinois variant of regula falsi (Glickman §5.1).
function newVolatility(phi: number, sigma: number, delta: number, v: number): number {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta2 - phi2 - v - ex);
    const den = 2 * (phi2 + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}
