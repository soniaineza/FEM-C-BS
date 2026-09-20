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
  // flex-1 inside the tab bar's flex-row gives every item an equal share of
  // the width (no fixed 72px that misaligns on wider screens); min-h keeps a
  // comfortable touch target per Material guidance.
  return (
    <View className="min-h-[56px] flex-1 items-center justify-center px-1">
      <Ionicons name={name} size={22} color={focused ? ACTIVE : INACTIVE} />
      <Text className={`mt-1 text-[11px] ${focused ? 'font-semibold' : 'font-normal'}`} style={{ color: focused ? ACTIVE : INACTIVE }}>
        {label}
      </Text>
      <View className="mt-1 h-[2px] w-6 rounded-full" style={{ backgroundColor: focused ? ACTIVE : 'transparent' }} />
    </View>
  );
}

// Four tabs matching the reference design: Home / My Rides / Wallet / More,
// with a small underline bar beneath the active tab instead of a plain
// color change. tabBarShowLabel is off globally since TabIcon renders its
// own label + underline together. Labels come from the locale dictionary so
// they follow the app language.
export default function TabsLayout() {
  const { t } = useTranslation();
  // The tab bar must extend to the very bottom of the screen and paint
  // through the Android gesture-navigation inset itself — a fixed 64px bar
  // sitting above the inset left a dead white strip below it (the reported
  // "whole space at the bottom"). This matches the reference design where
  // the bar's white background runs flush to the screen edge.
  const insets = useSafeAreaInsets();
  // 60px of real bar + the device's gesture-nav inset painted by the bar
  // itself, so the white background runs flush to the screen edge with no
  // dead strip below and the icons stay clear of the home indicator.
  const tabBarHeight = 60 + insets.bottom;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 4,
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
        name="activity"
        options={{
          title: t('myRides'),
          tabBarIcon: ({ focused }) => <TabIcon name="reload-outline" label={t('myRides')} focused={focused} />,
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
        name="profile"
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
