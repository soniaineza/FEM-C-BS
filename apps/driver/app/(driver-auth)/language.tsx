import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { BrandMark } from '@kimu/shared/components/BrandMark';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { Locale } from '@kimu/shared/locales';

// First-launch language chooser. Shown before the welcome/login screens via a
// redirect in (driver-auth)/index.tsx while useLocaleStore.hasChosenLanguage is false.
// Kinyarwanda is pre-selected (the store default); picking a card just stages
// the choice, and Continue persists it via setLocale (which flips the gate) and
// returns to the welcome screen.
const OPTIONS: { locale: Locale; flag: string }[] = [
  { locale: 'rw', flag: '\u{1F1F7}\u{1F1FC}' },
  { locale: 'en', flag: '\u{1F1EC}\u{1F1E7}' },
  { locale: 'fr', flag: '\u{1F1EB}\u{1F1F7}' },
];

export default function LanguageScreen() {
  const { t, locale, setLocale, languageNames } = useTranslation();
  const [selected, setSelected] = useState<Locale>(locale);

  async function handleContinue() {
    await setLocale(selected);
    // hasChosenLanguage is now true, so the welcome screen renders instead of
    // redirecting back here.
    router.replace('/(driver-auth)');
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-6 py-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="max-w-[480px] w-full self-center">
          <BrandMark fontSize={26} />

          <Text className="mt-8 text-center text-2xl text-ink font-display">
            {t('chooseYourLanguage')}
          </Text>
          <Text className="font-sans mt-2 text-center text-text-secondary">{t('chooseLanguageHint')}</Text>

          <View className="mt-8 gap-3">
            {OPTIONS.map(({ locale: l, flag }) => {
              const active = selected === l;
              return (
                <Pressable
                  key={l}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  aria-checked={active}
                  onPress={() => setSelected(l)}
                  className="flex-row items-center rounded-2xl px-4 py-4"
                  style={{
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? '#0E7C4A' : '#E5E7EB',
                    backgroundColor: active ? 'rgba(14,124,74,0.06)' : '#fff',
                  }}
                >
                  <Text className="font-sans" style={{ fontSize: 26 }}>{flag}</Text>
                  <Text className="ml-3.5 flex-1 text-base font-semibold text-ink">
                    {languageNames[l]}
                  </Text>
                  <Ionicons
                    name={active ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={active ? '#0E7C4A' : '#C7CCD1'}
                  />
                </Pressable>
              );
            })}
          </View>

          <View className="mt-8">
            <Button title={t('continueLabel')} onPress={handleContinue} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
