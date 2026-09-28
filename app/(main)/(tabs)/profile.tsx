import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { MenuTile } from '../../../components/MenuTile';
import { SectionTitle } from '../../../components/SectionTitle';
import { useTranslation } from '../../../hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useAppModeStore } from '../../../stores/useAppModeStore';

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Direct port of profile_screen.dart: avatar+name header card, then three
// grouped menus (Account / Support / Account actions) of icon+chevron rows.
export default function ProfileScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const setMode = useAppModeStore((s) => s.setMode);

  function confirmLogout() {
    Alert.alert(t('logoutQuestion'), undefined, [
      { text: t('stay'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout() },
    ]);
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-bg-light" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerClassName="px-5 pb-6 pt-4">
        <Text className="text-xl font-bold text-ink">{t('profile')}</Text>

        <View className="mt-4 flex-row items-center rounded-2xl border border-border bg-white p-4">
          <View className="h-[60px] w-[60px] items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}>
            <Text className="text-xl font-bold text-primary">{initialsFor(currentUser?.fullName ?? '')}</Text>
          </View>
          <View className="ml-3.5 flex-1">
            <Text className="text-[17px] font-bold text-ink">{currentUser?.fullName || 'Passenger'}</Text>
            <Text className="text-[13.5px] text-text-secondary">{currentUser?.phone}</Text>
            {currentUser?.email ? <Text className="text-[13.5px] text-text-secondary">{currentUser.email}</Text> : null}
          </View>
        </View>

        <View className="mt-5">
          <SectionTitle>{t('account')}</SectionTitle>
          <View className="mt-2">
            <MenuTile icon="person-outline" label={t('editProfile')} onPress={() => router.push('/(main)/settings/edit-profile')} />
            <MenuTile icon="location-outline" label={t('savedPlaces')} onPress={() => router.push('/(main)/settings/saved-places')} />
            <MenuTile icon="card-outline" label={t('paymentMethods')} onPress={() => router.push('/(main)/settings/payment-methods')} />
            <MenuTile icon="notifications-outline" label={t('notifications')} onPress={() => router.push('/(main)/settings/notifications')} />
          </View>
        </View>

        <View className="mt-5">
          <SectionTitle>{t('support')}</SectionTitle>
          <View className="mt-2">
            <MenuTile icon="headset-outline" label={t('helpSupportTitle')} onPress={() => router.push('/(main)/settings/help-support')} />
            <MenuTile icon="document-text-outline" label={t('termsOfService')} onPress={() => router.push('/(main)/settings/terms')} />
            <MenuTile icon="shield-checkmark-outline" label={t('privacyPolicy')} onPress={() => router.push('/(main)/settings/privacy')} />
            <MenuTile icon="settings-outline" label={t('settings')} onPress={() => router.push('/(main)/settings/settings')} />
          </View>
        </View>

        <View className="mt-5">
          <SectionTitle>{t('accountActions')}</SectionTitle>
          <View className="mt-2">
            <MenuTile
              icon="trash-outline"
              label={t('deleteAccount')}
              destructive
              onPress={() => router.push('/(main)/settings/delete-account')}
            />
            <MenuTile icon="log-out-outline" label={t('logout')} onPress={confirmLogout} />
            <MenuTile
              icon="car-outline"
              label={t('passengerSwitchToDriverHint')}
              onPress={() => setMode('driver')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
