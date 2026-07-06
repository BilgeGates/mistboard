// Entry page for the standalone /analysis/xiangqi route. Reads a coordinate move
// list from the ?moves= query (so an analysis is shareable + reloadable) or
// offers a paste box, then hands off to mountXiangqiAnalysis. Coordinate import
// only for now (our square notation, = Fairy-Stockfish xiangqi UCI); WXF /
// Chinese notation import is the planned follow-on.

import './dark-xiangqi-postgame.css';
import './xiangqi-analysis.css';
import { parseXiangqiCoordinateMoves } from './review/xiangqi-review-model.js';
import { buildNav } from './site-shell.js';
import { mountXiangqiAnalysis } from './xiangqi-analysis.js';

const SAMPLE = 'b3e3 h8e8 b1c3';

export function mountXiangqiAnalysisPage(root: HTMLElement): void {
  root.classList.add('landing-page');
  const raw = new URLSearchParams(window.location.search).get('moves');
  if (raw) {
    const { moves, error } = parseXiangqiCoordinateMoves(raw);
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
    'Paste a game as coordinate moves (e.g. b3e3 h8e8 b1c3), separated by spaces or commas. The board opens in the analysis shell with the engine available.';

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
    const { moves, error: parseError } = parseXiangqiCoordinateMoves(textarea.value);
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
