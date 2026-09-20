import { dictionaries, Locale } from '../locales';

// Minimal t() for code outside React (the two API clients). Network errors
// are thrown before any component re-renders, so they read the locale
// directly off the zustand store — same dictionaries, same fallback chain
// (active locale -> en -> key) as hooks/useTranslation.ts's t().
export function tFor(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[locale];
  let value = dict[key] ?? dictionaries.en[key] ?? String(key);
  if (params) {
    for (const [name, val] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(val));
    }
  }
  return value;
}
