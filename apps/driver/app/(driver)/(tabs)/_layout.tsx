import { Tabs } from 'expo-router';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';

// The four main destinations still live as tab routes so their URLs and
// navigation state stay put, but the bar itself is gone: the reference driver
// app navigates from the side drawer, so DriverDrawer is the only menu and
// `tabBar` renders nothing.
export default function DriverTabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={() => null}
    >
      <Tabs.Screen name="index" options={{ title: t('home') }} />
      <Tabs.Screen name="trips" options={{ title: t('driverMyRides') }} />
      <Tabs.Screen name="wallet" options={{ title: t('wallet') }} />
      <Tabs.Screen name="more" options={{ title: t('more') }} />
    </Tabs>
  );
}
