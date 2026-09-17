import { Stack } from 'expo-router';

import { usePushRegistration } from '../../hooks/usePushRegistration';

export default function MainLayout() {
  usePushRegistration(true);
  return <Stack screenOptions={{ headerShown: false }} />;
}
