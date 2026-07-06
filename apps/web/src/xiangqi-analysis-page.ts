// Entry page for the standalone /analysis/xiangqi route. Reads a move list from
// the ?moves= query (so an analysis is shareable + reloadable) or offers a paste
// box, then hands off to mountXiangqiAnalysis. The importer auto-detects the
// notation (coordinate, 0-indexed UCI/ICCS/UCCI, WXF, Chinese) and normalizes to
// canonical moves; shared links are always re-encoded as canonical coordinate.

import './dark-xiangqi-postgame.css';
import './xiangqi-analysis.css';
import { importXiangqiGame } from './review/xiangqi-import.js';
import { buildNav } from './site-shell.js';
import { mountXiangqiAnalysis } from './xiangqi-analysis.js';

const SAMPLE = '炮二平五 炮8平5 马二进三';

export function mountXiangqiAnalysisPage(root: HTMLElement): void {
  root.classList.add('landing-page');
  const raw = new URLSearchParams(window.location.search).get('moves');
  if (raw) {
    const { moves, error } = importXiangqiGame(raw);
    if (!error && moves.length > 0) {
      mountXiangqiAnalysis(root, moves, { title: 'Xiangqi analysis' });
      return;
    }
    renderForm(root, raw, error ?? 'No moves to analyse.');
    return;
  }
  renderForm(root, '', null);
}

function renderForm(root: HTMLElement, initial: string, error: string | null): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';

  const card = document.createElement('section');
  card.className = 'dxq-postgame__panel xiangqi-analysis-form__card';

  const heading = document.createElement('h1');
  heading.textContent = 'Xiangqi analysis';
  const blurb = document.createElement('p');
  blurb.textContent =
    'Paste a game in Chinese (炮二平五), WXF (C2.5 H2+3), or coordinate/UCI (b3e3) notation. The format is detected automatically and the board opens in the analysis shell with the engine available.';

  const textarea = document.createElement('textarea');
  textarea.className = 'xiangqi-analysis-form__input';
  textarea.rows = 6;
  textarea.placeholder = SAMPLE;
  textarea.value = initial;
  textarea.spellcheck = false;

  const errorEl = document.createElement('p');
  errorEl.className = 'xiangqi-analysis-form__error';
  errorEl.setAttribute('role', 'alert');
  if (error) errorEl.textContent = error;

  const analyse = document.createElement('button');
  analyse.type = 'button';
  analyse.className = 'dxq-postgame__link dxq-postgame__link--primary';
  analyse.textContent = 'Analyse';

  const submit = () => {
    const { moves, error: parseError } = importXiangqiGame(textarea.value);
    if (parseError || moves.length === 0) {
      errorEl.textContent = parseError ?? 'Enter at least one move.';
      return;
    }
    const encoded = moves.map((move) => `${move.from}${move.to}`).join(',');
    window.history.pushState({}, '', `${window.location.pathname}?moves=${encoded}`);
    mountXiangqiAnalysis(root, moves, { title: 'Xiangqi analysis' });
  };
  analyse.addEventListener('click', submit);
  // Cmd/Ctrl+Enter submits from the textarea (a plain Enter stays a newline).
  textarea.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  card.append(heading, blurb, textarea, errorEl, analyse);
  shell.append(card);
  root.replaceChildren(buildNav(), shell);
}
