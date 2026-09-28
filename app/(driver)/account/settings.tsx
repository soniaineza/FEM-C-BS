import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { appAlert } from '../../../utils/dialog';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { MenuTile } from '../../../components/MenuTile';
import { BackHeader } from '../../../components/BackHeader';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useAppModeStore } from '../../../stores/useAppModeStore';
import { useTranslation } from '../../../hooks/useTranslation';
import { ApiError } from '../../../services/driver-api-client';

export default function DriverSettingsScreen() {
  const { t } = useTranslation();
  const logout = useDriverAuthStore((s) => s.logout);
  const deleteAccount = useDriverAuthStore((s) => s.deleteAccount);
  const setMode = useAppModeStore((s) => s.setMode);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function confirmLogout() {
    // Alert buttons need plain strings from the active dictionary —
    // Alert.alert doesn't re-render on locale change, which is fine: the
    // dialog is transient and built from the locale at press time.
    appAlert(t('logOutConfirmTitle'), undefined, [
      { text: t('stay'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout() },
    ]);
  }

  async function handleDelete() {
    setError(undefined);
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('deleteAccountFailed'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-bg-light">
      <ScrollView contentContainerClassName="px-5 pb-8 pt-2">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('settings')}</Text>

        <View className="mt-4">
          <MenuTile icon="log-out-outline" label={t('logout')} onPress={confirmLogout} />
          <MenuTile icon="swap-horizontal-outline" label={t('switchToRiderApp')} onPress={() => setMode('passenger')} />
        </View>

        <Text className="mt-3 text-xs leading-5 text-text-secondary">{t('driverLocationDisclosure')}</Text>

        <Text className="mt-8 text-base font-bold text-error">{t('deleteAccount')}</Text>
        <Text className="mt-2 text-sm text-text-secondary">{t('deleteAccountWarning')}</Text>
        <Pressable className="mt-4 flex-row items-start" onPress={() => setConfirmDelete((v) => !v)}>
          <Ionicons name={confirmDelete ? 'checkbox' : 'checkbox-outline'} size={22} color={confirmDelete ? '#DC2626' : '#6B7280'} />
          <Text className="ml-2.5 flex-1 text-sm leading-5 text-ink">{t('deleteAccountConfirm')}</Text>
        </Pressable>
        {error ? <View className="mt-3"><ErrorMessage message={error} /></View> : null}
        <View className="mt-4">
          <Button title={t('deleteMyAccount')} destructive disabled={!confirmDelete} loading={deleting} onPress={handleDelete} />
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
