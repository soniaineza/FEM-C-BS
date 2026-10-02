import { Tabs } from 'expo-router';

import { KimuBottomNavigation } from '../../../components/KimuBottomNavigation';
import { useTranslation } from '../../../hooks/useTranslation';

// Four tabs matching the reference driver shell (Home / My Rides / Wallet /
// More), rendered by the same shared KimuBottomNavigation component as the
// passenger app — one bar implementation, no duplicated styling. This also
// removes the old fixed 72px item widths that misaligned on narrow/wide
// devices. Labels come from the locale dictionary so they follow the app
// language.
export default function DriverTabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
      tabBar={(props) => <KimuBottomNavigation {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: t('home') }} />
      <Tabs.Screen name="trips" options={{ title: t('driverMyRides') }} />
      <Tabs.Screen name="wallet" options={{ title: t('wallet') }} />
      <Tabs.Screen name="more" options={{ title: t('more') }} />
    </Tabs>
  );
}
