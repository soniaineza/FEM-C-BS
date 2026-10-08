import { Tabs } from 'expo-router';

import { KimuBottomNavigation } from '@kimu/shared/components/KimuBottomNavigation';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';

export default function TabsLayout() {
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
      <Tabs.Screen name="wallet" options={{ title: t('wallet') }} />
      <Tabs.Screen name="profile" options={{ title: t('profile') }} />
    </Tabs>
  );
}
