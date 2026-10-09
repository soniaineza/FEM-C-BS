import { View, Text, Pressable } from 'react-native';
import { memo } from 'react';

import { useTranslation } from '../hooks/useTranslation';
import { Locale, supportedLocales } from '../locales';

const SHORT: Record<Locale, string> = { rw: 'KINY', en: 'ENG', fr: 'FRA' };

// Compact language toggle (KINY · ENG · FRA) for screen headers, readable on
// top of a photo. Tapping one switches the whole app immediately, so the
// choice can be made on the very first screen without a separate step.
export const LanguageSwitch = memo(function LanguageSwitch() {
  const { locale, setLocale, languageNames } = useTranslation();
  return (
    <View
      className="shrink-0 flex-row rounded-full bg-white p-1"
      accessibilityRole="radiogroup"
      style={{ shadowColor: '#111111', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}
    >
      {supportedLocales.map((l) => {
        const active = l === locale;
        return (
          <Pressable
            key={l}
            onPress={() => setLocale(l)}
            accessibilityRole="radio"
            accessibilityLabel={languageNames[l]}
            accessibilityState={{ checked: active }}
            hitSlop={4}
            className={`h-8 items-center justify-center rounded-full px-2.5 ${active ? 'bg-primary' : ''}`}
          >
            <Text className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-ink'}`} style={{ letterSpacing: 0.4 }}>
              {SHORT[l]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

LanguageSwitch.displayName = 'LanguageSwitch';
