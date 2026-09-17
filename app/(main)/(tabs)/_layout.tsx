import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
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

// Four tabs matching the reference design: Home / My Rides / Wallet / More,
// with a small underline bar beneath the active tab instead of a plain
// color change. tabBarShowLabel is off globally since TabIcon renders its
// own label + underline together.
export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: { height: 64, paddingTop: 6 } }}>
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
          title: 'My Rides',
          tabBarIcon: ({ focused }) => <TabIcon name="reload-outline" label="My Rides" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? 'wallet' : 'wallet-outline'} label="Wallet" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'More',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'} label="More" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
