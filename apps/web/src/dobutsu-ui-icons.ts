import './dobutsu-ui-icons.css';
import type { AnnouncementKind } from './announcements.js';

export type DobutsuUiIconId =
  | 'announcement-a'
  | 'announcement-b'
  | 'challenge-friend'
  | 'create-topic'
  | 'find-opponent'
  | 'forum-topic'
  | 'notification'
  | 'play-engine'
  | 'store'
  | 'support';

const DOBUTSU_ICON_SRC: Record<DobutsuUiIconId, string> = {
  'announcement-a': '/ui/dobutsu/announcement-a.png',
  'announcement-b': '/ui/dobutsu/announcement-b.png',
  'challenge-friend': '/ui/dobutsu/challenge-friend.png',
  'create-topic': '/ui/dobutsu/create-topic.png',
  'find-opponent': '/ui/dobutsu/find-opponent.png',
  'forum-topic': '/ui/dobutsu/forum-topic.png',
  notification: '/ui/dobutsu/notification.png',
  'play-engine': '/ui/dobutsu/play-engine.png',
  store: '/ui/dobutsu/store.png',
  support: '/ui/dobutsu/support.png',
};

export function buildDobutsuUiIcon(id: DobutsuUiIconId, className = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = ['dobutsu-ui-icon', `dobutsu-ui-icon-${id}`, className].filter(Boolean).join(' ');
  img.src = DOBUTSU_ICON_SRC[id];
  img.alt = '';
  img.decoding = 'async';
  img.width = 96;
  img.height = 96;
  return img;
}

export function dobutsuIconForAnnouncementKind(kind: AnnouncementKind): DobutsuUiIconId {
  switch (kind) {
    case 'release':
    case 'update':
      return 'announcement-a';
    case 'article':
    case 'status':
      return 'announcement-b';
  }
}
