import { useState } from 'react';
import { appAlert } from '../../../utils/dialog';
import { router } from 'expo-router';

import { MenuTile } from '../../../components/MenuTile';
import { ListSection, Screen, ScreenHeader, Sheet, SheetOption } from '../../../components/ui';
import { useTranslation } from '../../../hooks/useTranslation';
import { Locale } from '../../../locales';

// Direct port of settings_screen.dart: the same icon+chevron MenuTile
// pattern as profile_screen.dart, with trailing value text for
// language/appearance, and native alerts for the informational dialogs
// (location/security) matching the original's AlertDialog usage.
export default function SettingsScreen() {
  const { t, locale, setLocale, languageNames } = useTranslation();
  const [langModalOpen, setLangModalOpen] = useState(false);

  return (
    <Screen header={<ScreenHeader back title={t('settings')} />}>
      <ListSection title={t('preferences')} className="mt-2">
        <MenuTile icon="notifications-outline" label={t('notifications')} onPress={() => router.push('/(main)/settings/notifications')} />
        <MenuTile icon="language-outline" label={t('language')} trailing={languageNames[locale]} onPress={() => setLangModalOpen(true)} />
        <MenuTile icon="color-palette-outline" label={t('appearance')} trailing={t('light')} onPress={() => appAlert(t('appearance'), t('appearanceNotice'))} />
      </ListSection>

      <ListSection title={t('security')} footer={t('locationNotice')}>
        <MenuTile icon="location-outline" label={t('locationPermission')} onPress={() => appAlert(t('locationDialogTitle'), t('locationDialogBody'))} />
        <MenuTile icon="lock-closed-outline" label={t('security')} onPress={() => appAlert(t('securityTitle'), t('securityBody'))} />
        <MenuTile icon="shield-checkmark-outline" label={t('privacyPolicy')} onPress={() => router.push('/(main)/settings/privacy')} />
        <MenuTile icon="document-text-outline" label={t('termsOfService')} onPress={() => router.push('/(main)/settings/terms')} />
      </ListSection>

      <Sheet visible={langModalOpen} onClose={() => setLangModalOpen(false)} title={t('chooseLanguage')}>
        {(['rw', 'fr', 'en'] as Locale[]).map((l) => (
          <SheetOption
            key={l}
            label={languageNames[l]}
            selected={locale === l}
            onPress={() => {
              setLocale(l);
              setLangModalOpen(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}
