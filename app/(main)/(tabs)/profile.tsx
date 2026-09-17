import { View, Text, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';

import { useTranslation } from '../../../hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable className="flex-row items-center justify-between border-b border-border py-4" onPress={onPress}>
      <Text className="text-base text-ink">{label}</Text>
      <Text className="text-text-secondary">{'>'}</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-2xl font-bold text-ink">{t('profile')}</Text>
        <View className="mt-4 gap-1">
          <Text className="text-lg font-semibold text-ink">{currentUser?.fullName}</Text>
          <Text className="text-text-secondary">{currentUser?.email}</Text>
          <Text className="text-text-secondary">{currentUser?.phone}</Text>
        </View>

        <View className="mt-6">
          <Row label={t('editProfile')} onPress={() => router.push('/(main)/settings/edit-profile')} />
          <Row label={t('savedPlaces')} onPress={() => router.push('/(main)/settings/saved-places')} />
          <Row label={t('paymentMethods')} onPress={() => router.push('/(main)/settings/payment-methods')} />
          <Row label={t('notifications')} onPress={() => router.push('/(main)/settings/notifications')} />
          <Row label={t('settings')} onPress={() => router.push('/(main)/settings/settings')} />
          <Row label={t('helpSupportTitle')} onPress={() => router.push('/(main)/settings/help-support')} />
        </View>

        <View className="mt-auto pb-8">
          <Pressable className="items-center py-3" onPress={() => logout()}>
            <Text className="font-semibold text-error">{t('logout')}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
