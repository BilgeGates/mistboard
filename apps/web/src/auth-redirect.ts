import { currentLocale, type Locale, localizedHref } from './i18n/locale.js';

const AUTH_REFERRER_PARAM = 'referrer';

export function loginHrefForCurrentPage(locale: Locale = currentLocale()): string {
  const params = new URLSearchParams({ tab: 'login' });
  const referrer = safeLocalPath(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  if (referrer && !referrer.startsWith('/account')) params.set(AUTH_REFERRER_PARAM, referrer);
  return localizedHref(`/account?${params.toString()}`, locale);
}

export function requestedAuthReferrer(): string | null {
  return safeLocalPath(new URLSearchParams(window.location.search).get(AUTH_REFERRER_PARAM));
}

function safeLocalPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
