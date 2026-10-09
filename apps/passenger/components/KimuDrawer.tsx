import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, { SlideInLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useDrawerStore } from '../stores/useDrawerStore';
import { useAuthStore } from '../stores/useAuthStore';

type IconName = keyof typeof Ionicons.glyphMap;

// The side menu from the reference, in Kimu green: a header with the rider's
// avatar, name and phone, then the navigation items. Replaces the bottom tab
// bar — everything the rider needs is in here.
const ITEMS: { key: string; icon: IconName; href: Href; replace?: boolean }[] = [
  { key: 'drawerBookRide', icon: 'navigate', href: '/(main)/(tabs)', replace: true },
  { key: 'drawerYourProfile', icon: 'person-outline', href: '/(main)/(tabs)/profile' },
  { key: 'drawerYourRides', icon: 'time-outline', href: '/(main)/rides' },
  { key: 'drawerPayments', icon: 'wallet-outline', href: '/(main)/settings/payment-methods' },
  { key: 'drawerFareInfo', icon: 'receipt-outline', href: '/(main)/settings/fare-info' },
  { key: 'drawerTrustedContacts', icon: 'people-outline', href: '/(main)/settings/trusted-contacts' },
  { key: 'helpBotTitle', icon: 'chatbubble-ellipses-outline', href: '/(main)/settings/help-bot' },
  { key: 'drawerAbout', icon: 'information-circle-outline', href: '/(main)/settings/settings' },
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

export function KimuDrawer() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const open = useDrawerStore((s) => s.open);
  const setOpen = useDrawerStore((s) => s.setOpen);
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

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
              <Text className="text-xl font-bold text-primary">{initialsFor(currentUser?.fullName ?? '')}</Text>
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-bold text-white" numberOfLines={1}>{currentUser?.fullName || t('passenger')}</Text>
              <Text className="font-sans mt-0.5 text-[13px] text-white/90" numberOfLines={1}>{currentUser?.phone || currentUser?.email || ''}</Text>
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
            <Text className="ml-4 text-[15px] font-medium text-error">{t('logout')}</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
