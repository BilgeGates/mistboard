import { BANQI_SAMPLE_GAME } from '../../banqi-sample-game.js';
import {
  BANQI_CANNON_CAPTURE,
  BANQI_RANK_LADDER,
  BANQI_RULES_THUMBNAIL,
  BANQI_SETUP_BOARD,
  playClosing,
} from '../diagrams.js';
import type { Article } from '../types.js';

export const banqiArticle: Article = {
    slug: 'banqi',
    boardFamily: 'xiangqi',
    kind: 'rules',
    playableOnMistboard: true,
    title: 'Banqi (Chinese Dark Chess) Rules',
    summary:
      'Banqi rules: the 4x8 half-board xiangqi flip game, with face-down pieces, rank captures, screen-jumping cannons, and no royal general.',
    showSummaryOnPage: false,
    status: 'published',
    publishedAt: '2026-06-15',
    audience:
      'Players who grew up with banqi and newcomers who want the Taiwanese rules, the rank ladder, and the cannon explained on one page.',
    thumbnail: { kind: 'svg', svg: BANQI_RULES_THUMBNAIL },
    intro: [
      {
        kind: 'paragraph',
        text:
          "Banqi (暗棋, 'dark chess', also called half chess or flip chess) is played on half a xiangqi board with all thirty-two pieces shuffled face-down. Each turn, flip an unknown piece or move one of your revealed pieces one square. Captures follow rank, except for the cannon. You win by leaving the opponent with no legal move.",
      },
      {
        kind: 'paragraph',
        text:
          'It is the casual sibling of [xiangqi](/rules/xiangqi): a short game that needs only an ordinary xiangqi set and half the board. It shares names with [dark chess](/rules/dark-chess), the fog-of-war chess variant played on Mistboard, but it is a different game. This page follows Taiwanese rules, the version with screen-jumping cannons.',
      },
    ],
    sections: [
      {
        heading: 'Board and setup',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The board is half a xiangqi board: thirty-two squares in a 4x8 grid, shown here with the long side horizontal. Unlike xiangqi, pieces sit inside the squares rather than on intersections, and the thirty-two shuffled pieces exactly fill the board, every one face-down.',
          },
          {
            kind: 'paragraph',
            text:
              'Colors are not assigned in advance. The first player opens the game by flipping any piece: whatever color comes up is theirs, and the opponent plays the other.',
          },
          {
            kind: 'raw-svg',
            svg: BANQI_SETUP_BOARD,
          },
        ],
      },
      {
        heading: 'Turns',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "On your turn, do exactly one of three things: flip any face-down piece, move one of your revealed pieces one square orthogonally onto an empty square, or capture with one of your revealed pieces. A flip reveals the piece to both players, even if it belongs to your opponent. There is no passing.",
          },
        ],
      },
      {
        heading: 'Capture by rank',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Most pieces capture enemy pieces of their own rank or lower by stepping onto an adjacent square. In Taiwanese rules, the order is General > Advisor > Elephant > Chariot > Horse > Soldier. Two exceptions cross the ladder: a soldier can capture the general, and the general cannot capture soldiers.',
          },
          {
            kind: 'paragraph',
            text:
              'The cannon sits outside this rank ladder and uses its own capture rule. Face-down pieces cannot be captured. A piece must be flipped before anyone can take it, which makes every flip next to a strong enemy piece a calculated risk.',
          },
          {
            kind: 'raw-svg',
            svg: BANQI_RANK_LADDER,
          },
        ],
      },
      {
        heading: 'The cannon',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'The cannon ignores rank when it captures. For a capture only, it may travel any distance along a row or column and jump exactly one intervening piece, the screen. It then takes the first piece beyond that screen, and only if that piece is a revealed enemy. If a friendly or face-down piece sits there instead, the line is blocked and the cannon cannot reach past it. The screen itself can be friendly, enemy, or face-down.',
          },
          {
            kind: 'paragraph',
            text:
              'A non-capturing cannon move is still just one square orthogonally, like every other piece. Because a cannon needs a screen to capture, it cannot take an adjacent piece. As a target, an adjacent cannon can be taken by a general, advisor, elephant, chariot, or horse, but not by a soldier.',
          },
          {
            kind: 'raw-svg',
            svg: BANQI_CANNON_CAPTURE,
          },
        ],
      },
      {
        heading: 'Winning and draws',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'You win when your opponent has no legal move — usually because every enemy piece is captured, sometimes because they are boxed in. The general is not royal: capturing it is progress, not the win, and play continues until one side is wiped out or stuck.',
          },
          {
            kind: 'paragraph',
            text:
              'Mistboard draws a game two ways: 40 plies (single moves) with no flip or capture, or threefold repetition — the same position three times. Either counter resets on any flip or capture, since those cannot be taken back. There is no perpetual-chase rule; over the board, agree the no-progress and repetition limits before you start.',
          },
        ],
      },
      {
        heading: 'Regional rules',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Taiwanese rules (this page): non-cannon pieces move and capture one square by rank. Cannon is outside the rank ladder and captures by screen jump.',
          },
          {
            kind: 'paragraph',
            text:
              'Hong Kong rules: pieces still move one square, but the rank order usually follows xiangqi material value more closely, with chariot and horse above cannon, advisor, elephant, and soldier. Cannon captures by adjacency as part of that ladder.',
          },
          {
            kind: 'paragraph',
            text:
              "Mainland rules: often close to Taiwanese ranking, but cannon sits in the ladder instead of jumping, commonly just above soldier. Some versions also relax the general-soldier exception depending on which piece moves first.",
          },
          {
            kind: 'paragraph',
            text:
              'House variants: some groups allow capture attempts on face-down pieces, where an impossible capture flips the target instead. Decide this, repetition, and no-progress rules before over-the-board play.',
          },
        ],
      },
      {
        heading: 'Names',
        blocks: [
          {
            kind: 'paragraph',
            text:
              "暗棋 is Mandarin ànqí, 'dark chess'. The same game is also called 半棋 (half chess), the source of the English name banqi, and 翻棋 (flip chess). Computer-game literature often calls it Chinese Dark Chess. None of these are [jieqi](/rules/jieqi), the full-board xiangqi variant where shuffled pieces reveal as they move, and none are the fog-of-war [dark chess](/rules/dark-chess) played here.",
          },
        ],
      },
      {
        heading: 'A sample game',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Step through a real game below — MistyBanqi (Strongest) moving first, a human second. The opening flip leaves MistyBanqi playing Red and the human Black. Black wins the opening material — the first eight captures are all Black’s — but Red keeps its elephant, the highest piece left, and grinds out the win. A clean illustration that in Banqi, rank beats raw material. Tiles flip to their dealt piece the first time they are turned over.',
          },
          {
            kind: 'banqi-replay',
            spec: {
              red: BANQI_SAMPLE_GAME.red,
              black: BANQI_SAMPLE_GAME.black,
              event: BANQI_SAMPLE_GAME.event,
              outcome: 'MistyBanqi (Red) wins by resignation · 49 moves',
              resultText: BANQI_SAMPLE_GAME.result,
              deal: BANQI_SAMPLE_GAME.deal,
              moves: BANQI_SAMPLE_GAME.moves,
            },
          },
        ],
      },
      playClosing({
        heading: 'Where to next',
        lead: 'Banqi is playable on Mistboard: take on MistyBanqi at the strength you pick, or challenge a friend. Xiangqi is the parent game, and jieqi is the other hidden-identity cousin.',
        playLabel: 'Play MistyBanqi',
        playHref: '/?play=computer&gameSpecId=banqi',
        secondary: [
          { label: 'Challenge a friend', href: '/?play=friend&gameSpecId=banqi', emphasis: 'secondary' },
          { label: 'Xiangqi Rules', href: '/rules/xiangqi', emphasis: 'secondary' },
          { label: 'Jieqi', href: '/rules/jieqi', emphasis: 'secondary' },
          { label: 'Dark Chess', href: '/rules/dark-chess', emphasis: 'secondary' },
          { label: 'All rules', href: '/rules', emphasis: 'secondary' },
        ],
      }),
    ],
};
