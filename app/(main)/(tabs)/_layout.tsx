import { Tabs } from 'expo-router';

import { FEMBottomNavigation } from '../../../components/FEMBottomNavigation';
import { useTranslation } from '../../../hooks/useTranslation';

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
      tabBar={(props) => <FEMBottomNavigation {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: t('home') }} />
      <Tabs.Screen name="activity" options={{ title: t('myRides') }} />
      <Tabs.Screen name="wallet" options={{ title: t('wallet') }} />
      <Tabs.Screen name="profile" options={{ title: t('profile') }} />
    </Tabs>
  );
}
