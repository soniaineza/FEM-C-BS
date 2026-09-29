import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '../../../utils/dialog';
import { router } from 'expo-router';

import { MenuTile } from '../../../components/MenuTile';
import { Card } from '../../../components/Card';
import { Avatar, ListSection, Screen, ScreenHeader, Text } from '../../../components/ui';
import { Colors } from '../../../constants/theme';
import { useTranslation } from '../../../hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useAppModeStore } from '../../../stores/useAppModeStore';

// Direct port of profile_screen.dart: avatar+name header card, then three
// grouped menus (Account / Support / Account actions) of icon+chevron rows.
export default function ProfileScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const setMode = useAppModeStore((s) => s.setMode);

  function confirmLogout() {
    appAlert(t('logoutQuestion'), undefined, [
      { text: t('stay'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout() },
    ]);
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('profile')} className="pt-3" />

      <Card className="mt-3 flex-row items-center" onPress={() => router.push('/(main)/settings/edit-profile')} accessibilityLabel={t('editProfile')}>
        <Avatar name={currentUser?.fullName} size={60} />
        <View className="ml-4 flex-1">
          <Text variant="title-3" numberOfLines={1}>{currentUser?.fullName || 'Passenger'}</Text>
          {currentUser?.phone ? <Text variant="subhead" tone="muted" style={{ marginTop: 2 }}>{currentUser.phone}</Text> : null}
          {currentUser?.email ? <Text variant="subhead" tone="muted" numberOfLines={1}>{currentUser.email}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors['fg-disabled']} />
      </Card>

      <ListSection title={t('account')}>
        <MenuTile icon="person-outline" label={t('editProfile')} onPress={() => router.push('/(main)/settings/edit-profile')} />
        <MenuTile icon="location-outline" label={t('savedPlaces')} onPress={() => router.push('/(main)/settings/saved-places')} />
        <MenuTile icon="card-outline" label={t('paymentMethods')} onPress={() => router.push('/(main)/settings/payment-methods')} />
        <MenuTile icon="notifications-outline" label={t('notifications')} onPress={() => router.push('/(main)/settings/notifications')} />
      </ListSection>

      <ListSection title={t('support')}>
        <MenuTile icon="headset-outline" label={t('helpSupportTitle')} onPress={() => router.push('/(main)/settings/help-support')} />
        <MenuTile icon="document-text-outline" label={t('termsOfService')} onPress={() => router.push('/(main)/settings/terms')} />
        <MenuTile icon="shield-checkmark-outline" label={t('privacyPolicy')} onPress={() => router.push('/(main)/settings/privacy')} />
        <MenuTile icon="settings-outline" label={t('settings')} onPress={() => router.push('/(main)/settings/settings')} />
      </ListSection>

      <ListSection title={t('accountActions')}>
        <MenuTile icon="car-outline" label={t('passengerSwitchToDriverHint')} onPress={() => setMode('driver')} />
        <MenuTile icon="log-out-outline" label={t('logout')} onPress={confirmLogout} />
        <MenuTile icon="trash-outline" label={t('deleteAccount')} destructive onPress={() => router.push('/(main)/settings/delete-account')} />
      </ListSection>
    </Screen>
  );
}
