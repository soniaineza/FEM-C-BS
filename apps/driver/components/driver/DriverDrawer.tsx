import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, { SlideInLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useDriverDrawerStore } from '../../stores/useDriverDrawerStore';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';

type IconName = keyof typeof Ionicons.glyphMap;

// The driver side menu, in Kimu green: avatar, name and plate on top, then
// every destination in one list with a version footer at the bottom. Replaces
// the bottom tab bar — the reference driver app navigates entirely from here.
const ITEMS: { key: string; icon: IconName; href: Href; replace?: boolean }[] = [
  { key: 'home', icon: 'home-outline', href: '/(driver)/(tabs)', replace: true },
  { key: 'driverSidebarProfile', icon: 'person-outline', href: '/(driver)/(tabs)/more' },
  { key: 'driverMyRides', icon: 'car-outline', href: '/(driver)/(tabs)/trips' },
  { key: 'wallet', icon: 'wallet-outline', href: '/(driver)/(tabs)/wallet' },
  { key: 'driverSafety', icon: 'shield-checkmark-outline', href: '/(driver)/safety' },
  { key: 'notifications', icon: 'notifications-outline', href: '/(driver)/notifications' },
  { key: 'driverSidebarTariff', icon: 'pricetag-outline', href: '/(driver)/tariff' },
  { key: 'documents', icon: 'document-attach-outline', href: '/(driver)/account/documents' },
  { key: 'appLockTitle', icon: 'lock-closed-outline', href: '/(driver)/account/app-lock' },
  { key: 'driverSidebarSettings', icon: 'settings-outline', href: '/(driver)/account/settings' },
  { key: 'driverSidebarTerms', icon: 'document-text-outline', href: '/(driver)/terms' },
  { key: 'helpBotTitle', icon: 'chatbubble-ellipses-outline', href: '/(driver)/help-bot' },
  { key: 'helpSupportTitle', icon: 'headset-outline', href: '/(driver)/account/support' },
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Reanimated's Animated.View has no NativeWind interop, so the panel's own
// box (position, width, background, shadow) is plain styles, not classes.
const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '82%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 4, height: 0 },
    elevation: 24,
  },
});

export function DriverDrawer() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const open = useDriverDrawerStore((s) => s.open);
  const setOpen = useDriverDrawerStore((s) => s.setOpen);
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const logout = useDriverAuthStore((s) => s.logout);
  const version = Constants.expoConfig?.version ?? null;

  function go(item: (typeof ITEMS)[number]) {
    setOpen(false);
    if (item.replace) router.replace(item.href);
    else router.push(item.href);
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('close')}
        onPress={() => setOpen(false)}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
      />
      <Animated.View entering={SlideInLeft.springify().damping(22).stiffness(220)} style={styles.panel}>
        <View className="bg-primary px-5 pb-5" style={{ paddingTop: insets.top + 18 }}>
          <View className="flex-row items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-white">
              <Text className="text-xl font-bold text-primary">{initialsFor(currentDriver?.fullName ?? '')}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-bold text-white" numberOfLines={1}>
                {currentDriver?.fullName || t('driver')}
              </Text>
              <Text className="font-sans mt-0.5 text-[13px] text-white/90" numberOfLines={1}>
                {currentDriver?.vehiclePlate || currentDriver?.phone || ''}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerClassName="py-2" showsVerticalScrollIndicator={false}>
          {ITEMS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              onPress={() => go(item)}
              className="flex-row items-center border-b border-border/60 px-5 py-4 active:bg-gray-light"
            >
              <Ionicons name={item.icon} size={22} color="#0E7C4A" />
              <Text className="ml-4 text-[15px] font-medium text-ink">{t(item.key as any)}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => { setOpen(false); logout(); }}
            className="mt-2 flex-row items-center px-5 py-4 active:bg-gray-light"
          >
            <Ionicons name="log-out-outline" size={22} color="#DC2626" />
            <Text className="ml-4 text-[15px] font-medium text-error">{t('driverSidebarLogout')}</Text>
          </Pressable>

          {version ? (
            <Text className="font-sans pb-4 pt-3 text-center text-[11px] text-text-secondary" style={{ paddingBottom: insets.bottom + 16 }}>
              Ver {version}
            </Text>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
