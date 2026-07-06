import type { LuzhanqiPieceRole } from '@mistboard/game';

export type LuzhanqiSkinKind = 'animal' | 'builder' | 'den' | 'stone' | 'trap';

export type LuzhanqiSkinToken = {
  className: string;
  displayName: string;
  kind: LuzhanqiSkinKind;
  shortLabel: string;
};

export const ROLE_SKIN: Record<LuzhanqiPieceRole, LuzhanqiSkinToken> = {
  marshal: { className: 'lion', displayName: 'Lion', kind: 'animal', shortLabel: 'Li' },
  general: { className: 'tiger', displayName: 'Tiger', kind: 'animal', shortLabel: 'Ti' },
  'major-general': { className: 'bear', displayName: 'Bear', kind: 'animal', shortLabel: 'Be' },
  'brigadier-general': { className: 'wolf', displayName: 'Wolf', kind: 'animal', shortLabel: 'Wo' },
  colonel: { className: 'fox', displayName: 'Fox', kind: 'animal', shortLabel: 'Fx' },
  major: { className: 'deer', displayName: 'Deer', kind: 'animal', shortLabel: 'De' },
  captain: { className: 'hare', displayName: 'Hare', kind: 'animal', shortLabel: 'Ha' },
  lieutenant: { className: 'otter', displayName: 'Otter', kind: 'animal', shortLabel: 'Ot' },
  engineer: { className: 'mole', displayName: 'Mole', kind: 'builder', shortLabel: 'Mo' },
  bomb: { className: 'trap', displayName: 'Trap', kind: 'trap', shortLabel: 'Tr' },
  mine: { className: 'stone', displayName: 'Stone', kind: 'stone', shortLabel: 'St' },
  flag: { className: 'den', displayName: 'Den', kind: 'den', shortLabel: 'Dn' },
};

export function roleDisplayName(role: LuzhanqiPieceRole): string {
  return ROLE_SKIN[role].displayName;
}

export function renderLuzhanqiSkinMark(skin: LuzhanqiSkinToken | null): SVGElement {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute(
    'class',
    `luzhanqi-piece__mark${skin ? ` luzhanqi-piece__mark--${skin.kind}` : ''}`,
  );
  if (!skin) {
    const back = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    back.setAttribute('d', 'M -8 -6 Q 0 -14 8 -6 Q 4 3 0 10 Q -4 3 -8 -6 Z');
    group.append(back);
    return group;
  }
  if (skin.kind === 'animal' || skin.kind === 'builder') {
    const leftEar = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leftEar.setAttribute('d', 'M -13 -15 L -6 -24 L -1 -14 Z');
    const rightEar = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rightEar.setAttribute('d', 'M 13 -15 L 6 -24 L 1 -14 Z');
    group.append(leftEar, rightEar);
  }
  if (skin.kind === 'builder') {
    const snout = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    snout.setAttribute('cx', '0');
    snout.setAttribute('cy', '9');
    snout.setAttribute('rx', '8');
    snout.setAttribute('ry', '5');
    group.append(snout);
  }
  if (skin.kind === 'trap') {
    const trap = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trap.setAttribute('d', 'M -12 10 L 0 -13 L 12 10 Z');
    group.append(trap);
  }
  if (skin.kind === 'stone') {
    const stone = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    stone.setAttribute('d', 'M -13 8 L -7 -10 L 7 -13 L 14 2 L 5 13 Z');
    group.append(stone);
  }
  if (skin.kind === 'den') {
    const den = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    den.setAttribute('d', 'M -13 10 L -13 -3 L 0 -15 L 13 -3 L 13 10 Z');
    group.append(den);
  }
  return group;
}
