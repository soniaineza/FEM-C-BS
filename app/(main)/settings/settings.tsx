import { useState } from 'react';
import { View, Text, SafeAreaView, Pressable, Modal } from 'react-native';
import { router } from 'expo-router';

import { useTranslation } from '../../../hooks/useTranslation';
import { Locale } from '../../../locales';

function Row({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  return (
    <Pressable className="flex-row items-center justify-between border-b border-border py-4" onPress={onPress}>
      <Text className="text-base text-ink">{label}</Text>
      <Text className="text-text-secondary">{value ?? '>'}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { t, locale, setLocale, languageNames } = useTranslation();
  const [langModalOpen, setLangModalOpen] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-6">
        <Text className="text-xl font-bold text-ink">{t('settings')}</Text>

        <View className="mt-4">
          <Row label={t('language')} value={languageNames[locale]} onPress={() => setLangModalOpen(true)} />
          <Row label={t('appearance')} onPress={() => {}} />
          <Row label={t('security')} onPress={() => {}} />
          <Row label={t('termsOfService')} onPress={() => router.push('/(main)/settings/terms')} />
          <Row label={t('privacyPolicy')} onPress={() => router.push('/(main)/settings/privacy')} />
          <Row label={t('deleteAccount')} onPress={() => router.push('/(main)/settings/delete-account')} />
        </View>

        <Text className="mt-6 text-xs text-text-secondary">{t('appearanceNotice')}</Text>
        <Text className="mt-2 text-xs text-text-secondary">{t('securityBody')}</Text>
      </View>

      <Modal visible={langModalOpen} animationType="slide" transparent>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded bg-white p-6">
            <Text className="text-lg font-bold text-ink">{t('chooseLanguage')}</Text>
            {(['rw', 'fr', 'en'] as Locale[]).map((l) => (
              <Pressable
                key={l}
                className="mt-3 flex-row items-center justify-between"
                onPress={() => {
                  setLocale(l);
                  setLangModalOpen(false);
                }}
              >
                <Text className="text-base text-ink">{languageNames[l]}</Text>
                {locale === l ? <Text className="text-primary">{t('ok')}</Text> : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
