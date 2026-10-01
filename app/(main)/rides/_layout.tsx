import { Stack } from 'expo-router';

// History list + ride detail as one tab with its own stack: the tab bar
// stays visible, Back returns to the list, and the tab keeps its place when
// switching tabs.
export default function RideHistoryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
