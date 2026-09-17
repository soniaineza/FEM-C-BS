import { useCallback } from 'react';

import { dictionaries, languageNames, Locale, TranslationKey } from '../locales';
import { useLocaleStore } from '../stores/useLocaleStore';

// Mirrors app_localizations.dart's `_t({rw, fr, en})` lookup, but data-driven
// off locales/{rw,fr,en}.json instead of ~419 hardcoded Dart getters.
// Interpolation uses {placeholder} tokens (converted from Dart's $variable
// during extraction) instead of Dart string interpolation.
export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const dict = dictionaries[locale];
      let value = dict[key] ?? dictionaries.en[key] ?? String(key);
      if (params) {
        for (const [name, val] of Object.entries(params)) {
          value = value.replaceAll(`{${name}}`, String(val));
        }
      }
      return value;
    },
    [locale]
  );

  return { t, locale, setLocale, languageNames };
}

// Ports app_localizations.dart's languageLabel(locale) — a fixed, always-
// English-script label for a language name, independent of the active
// locale (used in the language picker itself).
export function languageLabel(locale: Locale): string {
  return languageNames[locale];
}
