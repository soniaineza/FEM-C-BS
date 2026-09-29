import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { appAlert } from '../../../utils/dialog';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { MenuTile } from '../../../components/MenuTile';
import { Card } from '../../../components/Card';
import { ListSection, Screen, ScreenHeader, Text } from '../../../components/ui';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useAppModeStore } from '../../../stores/useAppModeStore';
import { useTranslation } from '../../../hooks/useTranslation';
import { ApiError } from '../../../services/driver-api-client';
import { Colors } from '../../../constants/theme';

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
    <Screen header={<ScreenHeader back title={t('settings')} />}>
      <ListSection footer={t('driverLocationDisclosure')} className="mt-2">
        <MenuTile icon="swap-horizontal-outline" label={t('switchToRiderApp')} onPress={() => setMode('passenger')} />
        <MenuTile icon="log-out-outline" label={t('logout')} onPress={confirmLogout} />
      </ListSection>

      <Text variant="footnote" weight="semibold" tone="danger" style={{ marginTop: 32, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {t('deleteAccount')}
      </Text>
      <Card className="mt-2">
        <Text variant="subhead" tone="muted">{t('deleteAccountWarning')}</Text>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmDelete }}
          className="mt-4 flex-row items-start"
          onPress={() => setConfirmDelete((v) => !v)}
        >
          <Ionicons name={confirmDelete ? 'checkbox' : 'square-outline'} size={22} color={confirmDelete ? Colors.danger : Colors['fg-subtle']} />
          <Text variant="subhead" style={{ marginLeft: 10, flex: 1 }}>{t('deleteAccountConfirm')}</Text>
        </Pressable>
        {error ? <View className="mt-3"><ErrorMessage message={error} /></View> : null}
        <View className="mt-4">
          <Button title={t('deleteMyAccount')} destructive disabled={!confirmDelete} loading={deleting} onPress={handleDelete} />
        </View>
      </Card>
    </Screen>
  );
}
