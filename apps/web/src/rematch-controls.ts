import { liveState, noteRematchCancel, type PlayableSeat } from './live-state.js';

type SendSocket = (payload: unknown) => boolean;

// Shared post-game rematch controls for chess (white/black) and Dark Mini
// Xiangqi (red/black). Reads the unified `liveState.rematch`; the only per-game
// input is the two seat colors. Returns a single self-contained block so the
// room-action stack doesn't reshuffle as the rematch state changes — the
// Decline/Accept pair sits side by side in the slot the lone Rematch button held.
export function rematchControls(
  mySeat: PlayableSeat,
  theirSeat: PlayableSeat,
  sendSocket: SendSocket,
): HTMLElement {
  const offers = liveState.rematch.offers;
  const iOffered = Boolean(offers[mySeat]);
  const theyOffered = Boolean(offers[theirSeat]);

  const block = document.createElement('div');
  block.className = 'room-rematch';

  if (iOffered && theyOffered) {
    block.append(buttonRow(disabledButton('Starting rematch…')));
    return block;
  }
  if (iOffered) {
    block.append(
      note('Waiting for opponent…'),
      buttonRow(
        actionButton('Cancel rematch', () => {
          noteRematchCancel();
          sendSocket({ type: 'rematch:cancel' });
        }),
      ),
    );
    return block;
  }
  if (theyOffered) {
    block.append(
      note('Your opponent wants a rematch'),
      buttonRow(
        actionButton('Decline', () => sendSocket({ type: 'rematch:decline' })),
        actionButton('Accept', () => sendSocket({ type: 'rematch:offer' }), 'primary'),
      ),
    );
    return block;
  }
  // Idle — possibly just after the opponent declined our offer.
  if (liveState.rematch.declined) {
    block.append(note('Your opponent declined the rematch.'));
  }
  block.append(buttonRow(actionButton('Rematch', () => sendSocket({ type: 'rematch:offer' }))));
  return block;
}

function note(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'room-rematch-note';
  p.textContent = text;
  return p;
}

function buttonRow(...buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'room-rematch-buttons';
  row.append(...buttons);
  return row;
}

function actionButton(
  label: string,
  onClick: () => void,
  variant?: 'primary',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  if (variant) button.className = variant;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function disabledButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.disabled = true;
  button.textContent = label;
  return button;
}
