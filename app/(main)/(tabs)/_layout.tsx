import { Tabs } from 'expo-router';

// Bottom tab bar: Home / Activity / Profile, mirroring app_shell.dart. Full
// icon set and per-tab screens land in Phase 2/4; this establishes the
// group so (main)'s default route resolves here.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#16A34A',
        tabBarInactiveTintColor: '#6B7280',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
