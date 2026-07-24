// House UI icon set: professional line glyphs from Lucide (MIT-licensed,
// designer-drawn), rendered as inline SVG that inherits `currentColor`. This
// replaces the dobutsu mascot PNGs with one factory — `buildUiIcon(name)` — so
// the whole app speaks one icon language and a new icon is a one-line map entry.
// Sizing/colour is the consumer's job via CSS (see ui-icon.css); the glyph
// tints to the surrounding text colour, so no per-theme asset variants.
import {
  Bell,
  Bot,
  Crown,
  createElement,
  Heart,
  type IconNode,
  Megaphone,
  MessagesSquare,
  Newspaper,
  RadioTower,
  SquarePen,
  Store,
  Swords,
  Trophy,
  User,
  Users,
} from 'lucide';
import './ui-icon.css';
import type { AnnouncementKind } from './announcements.js';

export type UiIconName =
  | 'announcement-release'
  | 'announcement-article'
  | 'challenge-friend'
  | 'create-topic'
  | 'event-broadcast'
  | 'event-tournament'
  | 'featured-channel'
  | 'find-opponent'
  | 'forum-topic'
  | 'notification'
  | 'play-engine'
  | 'play-game'
  | 'player-human'
  | 'store'
  | 'support';

// Semantic app concept → Lucide glyph. Keep the mapping here, not at call sites,
// so the icon language is swappable in one place.
const UI_ICON_NODES: Record<UiIconName, IconNode> = {
  'announcement-release': Megaphone,
  'announcement-article': Newspaper,
  'challenge-friend': Swords,
  'create-topic': SquarePen,
  'event-broadcast': RadioTower,
  'event-tournament': Trophy,
  'featured-channel': Crown,
  'find-opponent': Users,
  'forum-topic': MessagesSquare,
  notification: Bell,
  'play-engine': Bot,
  'play-game': Swords,
  'player-human': User,
  store: Store,
  support: Heart,
};

export function buildUiIcon(name: UiIconName, className = ''): SVGElement {
  const svg = createElement(UI_ICON_NODES[name]);
  svg.classList.add('ui-icon', `ui-icon-${name}`);
  for (const extra of className.split(' ')) {
    if (extra) svg.classList.add(extra);
  }
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

export function uiIconForAnnouncementKind(kind: AnnouncementKind): UiIconName {
  switch (kind) {
    case 'release':
    case 'update':
      return 'announcement-release';
    case 'article':
    case 'status':
      return 'announcement-article';
  }
}
