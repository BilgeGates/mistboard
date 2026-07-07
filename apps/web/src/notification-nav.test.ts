import { afterEach, describe, expect, it } from 'vitest';
import {
  clearNotificationBells,
  mountNotificationBell,
  registerNotificationSource,
} from './notification-nav.js';

describe('notification nav', () => {
  afterEach(() => {
    clearNotificationBells();
    document.body.replaceChildren();
  });

  it('uses the standard SVG bell instead of the dobutsu notification art', () => {
    registerNotificationSource(async () => ({ count: 0, entries: [] }));
    const nav = document.createElement('nav');
    nav.innerHTML = '<div class="site-nav-utilities"><div data-account-nav></div></div>';
    document.body.append(nav);

    mountNotificationBell(nav);

    const trigger = nav.querySelector('.notif-nav-trigger');
    expect(trigger?.querySelector('svg')).not.toBeNull();
    expect(trigger?.querySelector('img.dobutsu-ui-icon-notification')).toBeNull();
  });
});
