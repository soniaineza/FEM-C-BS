import { View, Text, SafeAreaView } from 'react-native';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';

// Placeholder — full profile/settings screens land in Phase 4. Logout lives
// here now so the auth loop (login -> main -> logout -> auth) is testable
// end-to-end in Phase 1.
export default function ProfileScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-2xl font-bold text-ink">{t('profile')}</Text>
        <View className="mt-4 gap-1">
          <Text className="text-ink">{currentUser?.fullName}</Text>
          <Text className="text-text-secondary">{currentUser?.email}</Text>
          <Text className="text-text-secondary">{currentUser?.phone}</Text>
        </View>
        <View className="mt-8">
          <Button title={t('logout')} variant="outline" onPress={() => logout()} />
        </View>
      </View>
    </SafeAreaView>
  );
}
