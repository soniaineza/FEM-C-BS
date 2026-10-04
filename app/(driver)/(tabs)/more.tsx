import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { MenuTile } from '../../../components/MenuTile';
import { Card } from '../../../components/Card';
import { Avatar, Badge, Banner, ListSection, Screen, ScreenHeader, Text } from '../../../components/ui';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useTranslation } from '../../../hooks/useTranslation';
import { useAppModeStore } from '../../../stores/useAppModeStore';
import { Colors } from '../../../constants/theme';

// Driver-side counterpart to app/(main)/(tabs)/profile.tsx — same header +
// grouped-menu layout, as the "More" tab (matches the reference driver-home
// screenshot's bottom tab bar: Home / My Rides / Wallet / More).
export default function DriverMoreScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const setMode = useAppModeStore((s) => s.setMode);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('account')} className="pt-3" />

      <Card className="mt-3 flex-row items-center" onPress={() => router.push('/(driver)/account/edit-profile' as any)} accessibilityLabel={t('editProfile')}>
        <Avatar name={currentDriver?.fullName} size={60} />
        <View className="ml-4 flex-1">
          <Text variant="title-3" numberOfLines={1}>{currentDriver?.fullName || t('driver')}</Text>
          {currentDriver?.phone ? <Text variant="subhead" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>{currentDriver.phone}</Text> : null}
          <View className="mt-2 flex-row items-center gap-2">
            {currentDriver?.rating != null ? (
              <Badge icon="star" tone="warning" label={currentDriver.rating.toFixed(1)} />
            ) : (
              <Badge label={t('driverNoRatingYet')} />
            )}
            <Badge label={((currentDriver?.totalTrips ?? 0) === 1 ? t('driverTripsCountOne') : t('driverTripsCount', { count: currentDriver?.totalTrips ?? 0 }))} />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors['fg-disabled']} />
      </Card>

      {!currentDriver?.verified ? (
        <View className="mt-4">
          <Banner
            tone="warning"
            title={t('driverVerificationPending')}
            message={t('driverUploadDocumentsHint')}
            actionLabel={t('documents')}
            onAction={() => router.push('/(driver)/account/documents' as any)}
          />
        </View>
      ) : null}

      <ListSection title={t('driverProfileAndVehicle')}>
        <MenuTile icon="person-outline" label={t('editProfile')} onPress={() => router.push('/(driver)/account/edit-profile' as any)} />
        <MenuTile icon="car-outline" label={t('vehicle')} onPress={() => router.push('/(driver)/account/vehicle' as any)} />
        <MenuTile icon="document-text-outline" label={t('documents')} onPress={() => router.push('/(driver)/account/documents' as any)} />
        <MenuTile icon="card-outline" label={t('driverSidebarRegisterCard')} onPress={() => router.push('/(driver)/register-card' as any)} />
        <MenuTile icon="star-outline" label={t('ratings')} onPress={() => router.push('/(driver)/account/ratings' as any)} />
      </ListSection>

      <ListSection title={t('support')}>
        <MenuTile icon="notifications-outline" label={t('notifications')} onPress={() => router.push('/(driver)/notifications' as any)} />
        <MenuTile icon="headset-outline" label={t('helpSupportTitle')} onPress={() => router.push('/(driver)/account/support' as any)} />
        <MenuTile icon="settings-outline" label={t('settings')} onPress={() => router.push('/(driver)/account/settings' as any)} />
        <MenuTile icon="pricetag-outline" label={t('driverSidebarTariff')} onPress={() => router.push('/(driver)/tariff' as any)} />
        <MenuTile icon="play-circle-outline" label={t('driverSidebarHelpVideos')} onPress={() => router.push('/(driver)/help-videos' as any)} />
        <MenuTile icon="document-text-outline" label={t('driverSidebarTerms')} onPress={() => router.push('/(driver)/terms' as any)} />
        <MenuTile icon="swap-horizontal-outline" label={t('driverSwitchToRiderHint')} onPress={() => setMode('passenger')} />
      </ListSection>
    </Screen>
  );
}
