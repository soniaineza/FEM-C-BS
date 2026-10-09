import { Tabs } from 'expo-router';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';

// Navigation lives in the side menu (KimuDrawer), not a bottom bar, so the tab
// bar is hidden — these screens are just the drawer's destinations.
export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
      tabBar={() => null}
    >
      <Tabs.Screen name="index" options={{ title: t('home') }} />
      <Tabs.Screen name="wallet" options={{ title: t('wallet') }} />
      <Tabs.Screen name="profile" options={{ title: t('profile') }} />
    </Tabs>
  );
}
