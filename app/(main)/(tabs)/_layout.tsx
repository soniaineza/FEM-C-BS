import { Tabs } from 'expo-router';

import { KimuBottomNavigation } from '../../../components/KimuBottomNavigation';
import { useTranslation } from '../../../hooks/useTranslation';

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
