import { View, Text, SafeAreaView, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { MenuTile } from '../../../components/MenuTile';
import { SectionTitle } from '../../../components/SectionTitle';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useTranslation } from '../../../hooks/useTranslation';
import { useAppModeStore } from '../../../stores/useAppModeStore';

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Driver-side counterpart to app/(main)/(tabs)/profile.tsx — same header +
// grouped-menu layout, as the "More" tab (matches the reference driver-home
// screenshot's bottom tab bar: Home / My Rides / Wallet / More).
export default function DriverMoreScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const setMode = useAppModeStore((s) => s.setMode);

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <ScrollView contentContainerClassName="px-5 pb-6 pt-6">
        <Text className="text-xl font-bold text-ink">{t('account')}</Text>

        <View className="mt-4 flex-row items-center rounded-2xl border border-border bg-white p-4">
          <View className="h-[60px] w-[60px] items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}>
            <Text className="text-xl font-bold text-primary">{initialsFor(currentDriver?.fullName ?? '')}</Text>
          </View>
          <View className="ml-3.5 flex-1">
            <Text className="text-[17px] font-bold text-ink">{currentDriver?.fullName || t('driver')}</Text>
            <Text className="text-[13.5px] text-text-secondary">{currentDriver?.phone}</Text>
            <Text className="mt-0.5 text-[13.5px] text-text-secondary">
              {currentDriver?.rating != null ? `${currentDriver.rating.toFixed(1)} ★` : t('driverNoRatingYet')} · {t('driverTripsCount', { count: currentDriver?.totalTrips ?? 0 })}
            </Text>
          </View>
        </View>

        {!currentDriver?.verified ? (
          <View className="mt-3 rounded-xl border border-warning bg-white p-3.5">
            <Text className="text-xs font-semibold text-warning">{t('driverVerificationPending')}</Text>
            <Text className="mt-0.5 text-xs text-text-secondary">{t('driverUploadDocumentsHint')}</Text>
          </View>
        ) : null}

        <View className="mt-5">
          <SectionTitle>{t('driverProfileAndVehicle')}</SectionTitle>
          <View className="mt-2">
            <MenuTile icon="person-outline" label={t('editProfile')} onPress={() => router.push('/(driver)/account/edit-profile' as any)} />
            <MenuTile icon="car-outline" label={t('vehicle')} onPress={() => router.push('/(driver)/account/vehicle' as any)} />
            <MenuTile icon="document-text-outline" label={t('documents')} onPress={() => router.push('/(driver)/account/documents' as any)} />
            <MenuTile icon="star-outline" label={t('ratings')} onPress={() => router.push('/(driver)/account/ratings' as any)} />
          </View>
        </View>

        <View className="mt-5">
          <SectionTitle>{t('support')}</SectionTitle>
          <View className="mt-2">
            <MenuTile icon="notifications-outline" label={t('notifications')} onPress={() => router.push('/(driver)/notifications' as any)} />
            <MenuTile icon="headset-outline" label={t('helpSupportTitle')} onPress={() => router.push('/(driver)/account/support' as any)} />
            <MenuTile icon="settings-outline" label={t('settings')} onPress={() => router.push('/(driver)/account/settings' as any)} />
            <MenuTile
              icon="person-outline"
              label={t('driverSwitchToRiderHint')}
              onPress={() => setMode('passenger')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
