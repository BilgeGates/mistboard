// Standalone analysis boards for every non-xiangqi catalog variant: a fresh
// interactive board at the start position (hidden-deal variants mint a random
// client-side deal — the same bag the server would draw from), branching into a
// tree with the variant's in-browser engine where one exists. The heavy
// board/review stacks stay code-split: each case dynamic-imports its own review
// module. Xiangqi keeps its dedicated module (xiangqi-analysis.ts) for the
// ?moves= import flow.
//
// CSS here is the union the variants' postgame surfaces import; the JS chunks
// are what matter for weight, and those stay per-variant.

import './game-shell.css';
import './live-xiangqi.css';
import './landing.css';
import './game-route.css';
import './dark-xiangqi-postgame.css';
import './drop-mini-xiangqi.css';
import { type AnalysisVariantId, analysisVariantLabel } from './analysis-catalog.js';
import type { AnalysisSource } from './review/tree-review.js';
import { buildNav } from './site-shell.js';

type VariantAnalysisId = Exclude<AnalysisVariantId, 'xiangqi'>;

/** Synthetic game id for deal-minting adapters (state identity only, no room). */
const ANALYSIS_GAME_ID = 'analysis';

export async function mountVariantAnalysisPage(
  root: HTMLElement,
  id: VariantAnalysisId,
  picker: HTMLElement,
): Promise<void> {
  const label = analysisVariantLabel(id);

  root.classList.add('landing-page');
  root.replaceChildren(buildNav());

  const config = {
    pageClassName: `${id}-review`,
    ariaLabel: `${label} analysis`,
    title: `${label} analysis`,
    summary: 'Play a move',
    boardAriaLabel: `${label} board`,
    // The variant dropdown is the ENTIRE left rail (lichess analysis): it rides
    // the metaCard slot, replacing the title/summary info card.
    metaCard: picker,
    moves: [],
    // No roomless whole-game sweep yet outside xiangqi (the only client
    // analysis-source builder); the live engine panel still runs where the
    // variant has an in-browser engine.
    analysis: null as AnalysisSource | null,
  };

  switch (id) {
    case 'banqi': {
      // The board SVG's fills live in a page-level installed <style>, not the
      // imported CSS files — without the installer the board renders black.
      // Same contract as the postgame pages (banqi/jieqi/fortress below).
      const [{ mountBanqiReview }, { createBanqiDeal }, { installBanqiBoardStyles }] =
        await Promise.all([
          import('./review/banqi-review.js'),
          import('@mistboard/game'),
          import('./live-banqi-render.js'),
        ]);
      installBanqiBoardStyles();
      mountBanqiReview(root, ANALYSIS_GAME_ID, createBanqiDeal(Math.random), config);
      return;
    }
    case 'jungle': {
      const { mountJungleReview } = await import('./review/jungle-review.js');
      mountJungleReview(root, config);
      return;
    }
    case 'jungle-flip': {
      const [{ mountJungleFlipReview }, { createJungleFlipDeal }] = await Promise.all([
        import('./review/jungle-flip-review.js'),
        import('@mistboard/game'),
      ]);
      mountJungleFlipReview(root, ANALYSIS_GAME_ID, createJungleFlipDeal(Math.random), config);
      return;
    }
    case 'fortress-xiangqi': {
      const [{ mountFortressXiangqiReview }, { installFortressXiangqiBoardStyles }] =
        await Promise.all([
          import('./review/fortress-xiangqi-review.js'),
          import('./fortress-xiangqi-render.js'),
        ]);
      installFortressXiangqiBoardStyles();
      mountFortressXiangqiReview(root, config);
      return;
    }
    case 'jieqi': {
      const [{ mountJieqiReview }, { createJieqiDeal }, { installJieqiBoardStyles }] =
        await Promise.all([
          import('./review/jieqi-review.js'),
          import('@mistboard/game'),
          import('./live-jieqi-render.js'),
        ]);
      installJieqiBoardStyles();
      mountJieqiReview(root, ANALYSIS_GAME_ID, createJieqiDeal(Math.random), config);
      return;
    }
    case 'dark-xiangqi': {
      const { mountDarkXiangqiReview } = await import('./review/dark-xiangqi-review.js');
      mountDarkXiangqiReview(root, config);
      return;
    }
    case 'dark-chess': {
      const { mountDarkChessReview } = await import('./review/dark-chess-review.js');
      mountDarkChessReview(root, config);
      return;
    }
    default: {
      // Fail-closed: a new catalog member must get its own case, never another
      // variant's board.
      const exhaustive: never = id;
      throw new Error(`unsupported analysis variant: ${String(exhaustive)}`);
    }
  }
}
