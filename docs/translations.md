# Translations

Mistboard is English-first. English is the source contract for app interface copy. Simplified
Chinese (`zh-Hans`) and Traditional Chinese (`zh-Hant`) are the supported outreach locales.
Adding or retiring a locale is a product decision, not a per-feature requirement.

## North Star

Feature work adds English copy once. Supported locales fall back to English for ordinary gaps,
so incomplete translation work does not block delivery. A small set of critical journey keys must
be translated in every supported outreach locale before landing. Coverage is measured by domain,
and translation work can be batched independently.

The app catalog is split by ownership under `apps/web/src/i18n/catalogs/`:

- `shell`: navigation, homepage chrome, preferences, and shared status
- `content`: rules, articles, policy, and informational pages
- `account`: authentication, account settings, and security
- `community`: profiles, social surfaces, chat, and challenges
- `play`: setup, lobby, live play, and results
- `review`: replay and watch surfaces

## Adding interface copy

1. Add the English key to the appropriate domain catalog.
2. Use the key through `t(...)` in the interface.
3. Add it to that domain's `CRITICAL_*_I18N_KEYS` only when untranslated copy would break a core
   public journey, such as navigation, sign-in, game setup, live play, or result comprehension.
4. If the key is critical, add both Chinese translations in the same change. Otherwise, translation
   can follow in a focused batch and the interface safely falls back to English.
5. Run `npm run i18n:check`.

The checker fails on duplicate or stale keys, unsupported locale catalogs, empty values, invalid
domain ownership, and missing critical translations. Noncritical gaps are reported but do not fail
the command. Machine-readable coverage is available with:

```bash
npm run i18n:check -- --json
```

Article prose uses a separate value-based translation system. Inspect it with
`npm run i18n:coverage --workspace @mistboard/web`; published articles become blocking only after
they are explicitly added to `TRANSLATION_LOCKED_SLUGS`.
