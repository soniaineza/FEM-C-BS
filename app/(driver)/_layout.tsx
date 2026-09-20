import { Stack } from 'expo-router';

import { useDriverPushRegistration } from '../../hooks/useDriverPushRegistration';

export default function DriverLayout() {
  useDriverPushRegistration(true);
  return <Stack screenOptions={{ headerShown: false }} />;
}
