import { useCallback, useEffect, useRef, useState } from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import {
  View,
  Text,
  Pressable,
  Modal,
  Animated,
  ScrollView,
  Alert,
  Easing as RNEasing,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDriverAuthStore } from '../../stores/useDriverAuthStore';
import { useTranslation } from '../../hooks/useTranslation';

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

interface SidebarItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  path?: string;
  destructive?: boolean;
}

// Slide-out navigation drawer ("sidebar") for the driver dashboard. Rendered
// as a full-screen transparent Modal with a left panel that slides in from
// the edge — the same structural role as YegoCabs' drawer: profile header on
// top, the ten menu items in the exact order, and an app-version footer.
export function DriverSidebar({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const logout = useDriverAuthStore((s) => s.logout);
  const insets = useSafeAreaInsets();
  const { dimensions } = useResponsive();
  const sidebarWidth = dimensions.width < 390 ? '90%' : '84%';

  const translateX = useRef(new Animated.Value(-360)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        easing: RNEasing.out(RNEasing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateX, {
        toValue: -360,
        duration: 180,
        easing: RNEasing.in(RNEasing.cubic),
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function nav(path: string) {
    onClose();
    requestAnimationFrame(() => router.push(path as any));
  }

  function confirmLogout() {
    onClose();
    Alert.alert(t('logOutConfirmTitle'), undefined, [
      { text: t('stay'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout() },
    ]);
  }

  const items: SidebarItem[] = [
    { key: 'profile', icon: 'person-outline', label: t('driverSidebarProfile'), path: '/(driver)/(tabs)/more' },
    { key: 'trips', icon: 'car-outline', label: t('driverMyRides'), path: '/(driver)/(tabs)/trips' },
    { key: 'account', icon: 'person-circle-outline', label: t('driverSidebarMyAccount'), path: '/(driver)/account/edit-profile' },
    { key: 'messages', icon: 'chatbubble-ellipses-outline', label: t('driverSidebarMessages'), path: '/(driver)/notifications' },
    { key: 'tariff', icon: 'pricetag-outline', label: t('driverSidebarTariff'), path: '/(driver)/tariff' },
    { key: 'settings', icon: 'settings-outline', label: t('driverSidebarSettings'), path: '/(driver)/account/settings' },
    { key: 'card', icon: 'card-outline', label: t('driverSidebarRegisterCard'), path: '/(driver)/register-card' },
    { key: 'terms', icon: 'document-text-outline', label: t('driverSidebarTerms'), path: '/(driver)/terms' },
    { key: 'help', icon: 'play-circle-outline', label: t('driverSidebarHelpVideos'), path: '/(driver)/help-videos' },
    { key: 'logout', icon: 'log-out-outline', label: t('driverSidebarLogout'), destructive: true },
  ];

  const version = Constants.expoConfig?.version ?? '2.6.1';

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 flex-row" style={{ backgroundColor: 'rgba(4,8,16,0.72)' }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel={t('back')} />
        <Animated.View
          className="w-[84%] max-w-[340px] bg-dark-bg"
          style={{ transform: [{ translateX }], paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12, width: sidebarWidth }}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="px-5 pb-5 pt-2">
              <View className="flex-row items-center rounded-2xl border border-dark-border bg-dark-surface p-4">
                <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.16)' }}>
                  <Text className="text-lg font-bold text-primary">{initialsFor(currentDriver?.fullName ?? '')}</Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-base font-bold text-dark-text" numberOfLines={1}>
                    {currentDriver?.fullName || t('driver')}
                  </Text>
                  <Text className="mt-0.5 text-[13px] font-medium text-primary">{currentDriver?.vehiclePlate || '—'}</Text>
                </View>
                <Pressable className="p-1" onPress={onClose} hitSlop={8}>
                  <Ionicons name="close" size={22} color="#93A3C8" />
                </Pressable>
              </View>
            </View>

            <View className="px-3">
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  className="mb-1 flex-row items-center rounded-xl px-3.5 py-3"
                  onPress={() => (item.destructive ? confirmLogout() : item.path ? nav(item.path) : undefined)}
                >
                  <View className="w-7 items-center">
                    <Ionicons name={item.icon} size={20} color={item.destructive ? '#DC2626' : '#93A3C8'} />
                  </View>
                  <Text
                    className={`ml-2.5 flex-1 ${item.destructive ? 'font-semibold text-error' : 'font-medium text-dark-text'}`}
                    style={{ fontSize: dimensions.typography?.navLabel || 14.5 }}
                  >
                    {item.label}
                  </Text>
                  {!item.destructive ? <Ionicons name="chevron-forward" size={18} color="#5C6B8E" /> : null}
                </Pressable>
              ))}
            </View>

            <Pressable
              className="mx-5 mt-4 flex-row items-center justify-between rounded-xl border border-dark-border bg-dark-surface px-4 py-3"
              onPress={() => nav('/(driver)/wallet/payouts')}
            >
              <View className="flex-row items-center">
                <Ionicons name="cash-outline" size={18} color="#16A34A" />
                <Text className="ml-2.5 text-[13.5px] font-semibold text-dark-text">{t('driverPayouts')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#5C6B8E" />
            </Pressable>

            <Text className="mt-6 text-center font-medium text-dark-muted" style={{ fontSize: dimensions.typography?.caption || 10 }}>Ver: {version}</Text>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}