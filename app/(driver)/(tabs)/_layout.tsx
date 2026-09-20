import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../../hooks/useTranslation';

const ACTIVE = '#16A34A';
const INACTIVE = '#6B7280';

function TabIcon({
  name,
  label,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
}) {
  return (
    <View className="items-center" style={{ width: 72 }}>
      <Ionicons name={name} size={22} color={focused ? ACTIVE : INACTIVE} />
      <Text className={`mt-0.5 text-[11px] ${focused ? 'font-semibold' : 'font-normal'}`} style={{ color: focused ? ACTIVE : INACTIVE }}>
        {label}
      </Text>
      <View className="mt-1 h-[2px] w-6 rounded-full" style={{ backgroundColor: focused ? ACTIVE : 'transparent' }} />
    </View>
  );
}

// Four tabs matching the driver-home reference image exactly (Home / My
// Rides / Wallet / More, same shell as the rider app's tab bar) — this
// replaces an earlier drawer-based shell inferred from the decompiled APK's
// class names (kimu.ride.driver.app.ui.drawer.*), which the actual
// reference screenshot contradicts. Screenshot evidence wins. Labels come
// from the locale dictionary so they follow the app language.
export default function DriverTabsLayout() {
  const { t } = useTranslation();
  // Same bottom-inset handling as the passenger tabs layout: the bar paints
  // flush to the screen bottom through the gesture-nav inset — no dead strip.
  const insets = useSafeAreaInsets();
  const tabBarHeight = 64 + insets.bottom;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: insets.bottom,
          backgroundColor: '#FFFFFF',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'home' : 'home-outline'} label={t('home')} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: t('driverMyRides'),
          tabBarIcon: ({ focused }) => <TabIcon name="reload-outline" label={t('driverMyRides')} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: t('wallet'),
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'wallet' : 'wallet-outline'} label={t('wallet')} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('more'),
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'} label={t('more')} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
