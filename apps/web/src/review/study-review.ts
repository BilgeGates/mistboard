// Study chapter -> board dispatch. A study chapter is variant-generic below this
// line (the serialized tree carries UCIs only), but each variant needs its own
// tree-review stack to render and replay it, so this module is the fail-closed
// switch from a chapter's `variant` to that stack. Same shape as
// variant-analysis.ts: every case dynamic-imports its own review module so the
// study page does not ship five board stacks.
//
// Only variants with a DETERMINISTIC start position are here — that is what
// STUDY_ELIGIBLE_SPEC_IDS encodes. A hidden-deal variant (banqi, jieqi,
// jungle-flip) would need its deal persisted with the chapter; without it a saved
// line replays against a fresh deal and truncates to its legal prefix.

import type { StudyVariantId } from '../study-catalog.js';
import './../game-route.css';
import './../dark-xiangqi-postgame.css';
import type { TreeReviewConfig, TreeReviewHandle } from './tree-review.js';

/** The study page's slice of TreeReviewConfig: no `moves` (a study always seeds
 *  from `initialTree`), no whole-game `analysis` source, and a composition start
 *  given as a FEN string — resolving it to a truth state is the variant branch's
 *  job, since only some variants have a FEN parser. */
export type StudyReviewConfig = Omit<
  TreeReviewConfig<never>,
  'moves' | 'root' | 'analysis' | 'decisions'
> & {
  /** SerializedTree.rootFen — ignored by variants without a FEN parser. */
  rootFen?: string;
};

export async function mountStudyReview(
  variant: StudyVariantId,
  root: HTMLElement,
  config: StudyReviewConfig,
): Promise<TreeReviewHandle> {
  const { rootFen, ...rest } = config;
  const base = { ...rest, moves: [], analysis: null };

  switch (variant) {
    case 'xiangqi': {
      const [{ mountXiangqiReview }, { parseStandardXiangqiFen }] = await Promise.all([
        import('./xiangqi-review.js'),
        import('@mistboard/game'),
      ]);
      // A composition chapter roots the board at its hand-set position; an invalid
      // FEN degrades to the standard start, same posture as a corrupt blob.
      const parsed = rootFen ? parseStandardXiangqiFen(rootFen) : null;
      return mountXiangqiReview(root, {
        ...base,
        root: parsed?.ok ? { truth: parsed.state, fen: rootFen! } : undefined,
      });
    }
    case 'jungle': {
      const { mountJungleReview } = await import('./jungle-review.js');
      return mountJungleReview(root, base);
    }
    case 'fortress-xiangqi': {
      const [{ mountFortressXiangqiReview }, { installFortressXiangqiBoardStyles }] =
        await Promise.all([
          import('./fortress-xiangqi-review.js'),
          import('./../fortress-xiangqi-render.js'),
        ]);
      // The board SVG's fills live in a page-level installed <style>, not the
      // imported CSS files — without the installer the board renders black.
      installFortressXiangqiBoardStyles();
      return mountFortressXiangqiReview(root, base);
    }
    case 'dark-xiangqi': {
      const { mountDarkXiangqiReview } = await import('./dark-xiangqi-review.js');
      return mountDarkXiangqiReview(root, base);
    }
    case 'dark-chess': {
      const { mountDarkChessReview } = await import('./dark-chess-review.js');
      return mountDarkChessReview(root, base);
    }
    default: {
      // Fail-closed: a new catalog member must get its own case, never another
      // variant's board.
      const exhaustive: never = variant;
      throw new Error(`unsupported study variant: ${String(exhaustive)}`);
    }
  }
}
