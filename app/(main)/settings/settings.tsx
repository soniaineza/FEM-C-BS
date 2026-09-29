import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { appAlert } from '../../../utils/dialog';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { MenuTile } from '../../../components/MenuTile';
import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { Locale } from '../../../locales';

// Direct port of settings_screen.dart: the same icon+chevron MenuTile
// pattern as profile_screen.dart, with trailing value text for
// language/appearance, and native alerts for the informational dialogs
// (location/security) matching the original's AlertDialog usage.
export default function SettingsScreen() {
  const { t, locale, setLocale, languageNames } = useTranslation();
  // Centered dialog in a transparent Modal — no automatic SafeArea, so the
  // box gets a bottom margin equal to the system inset to stay visually
  // centered and clear of the gesture bar on edge-to-edge devices.
  const insets = useSafeAreaInsets();
  const [langModalOpen, setLangModalOpen] = useState(false);

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-bg-light">
      <ScrollView contentContainerClassName="px-5 pb-6 pt-2">
        <BackHeader />
        <Text className="mt-2 text-xl text-ink font-display">{t('settings')}</Text>

        <View className="mt-4">
          <MenuTile icon="notifications-outline" label={t('notifications')} onPress={() => router.push('/(main)/settings/notifications')} />
          <MenuTile
            icon="location-outline"
            label={t('locationPermission')}
            onPress={() => appAlert(t('locationDialogTitle'), t('locationDialogBody'))}
          />
          <MenuTile
            icon="language-outline"
            label={t('language')}
            trailing={languageNames[locale]}
            onPress={() => setLangModalOpen(true)}
          />
          <MenuTile
            icon="color-palette-outline"
            label={t('appearance')}
            trailing={t('light')}
            onPress={() => appAlert(t('appearance'), t('appearanceNotice'))}
          />
          <MenuTile icon="lock-closed-outline" label={t('security')} onPress={() => appAlert(t('securityTitle'), t('securityBody'))} />
          <MenuTile icon="shield-checkmark-outline" label={t('privacyPolicy')} onPress={() => router.push('/(main)/settings/privacy')} />
          <MenuTile icon="document-text-outline" label={t('termsOfService')} onPress={() => router.push('/(main)/settings/terms')} />
        </View>

        <Text className="mt-3 text-xs leading-5 text-text-secondary">{t('locationNotice')}</Text>
      </ScrollView>

      <Modal visible={langModalOpen} animationType="slide" transparent>
        <View className="flex-1 items-center justify-center bg-black/40 px-6" style={{ paddingBottom: insets.bottom }}>
          <View className="w-full rounded-2xl bg-white p-6">
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
    </SafeAreaViewPlaceholder>
  );
}
