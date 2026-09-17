import { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView } from 'react-native';

import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useTranslation } from '../hooks/useTranslation';
import { useAuthStore } from '../stores/useAuthStore';
import { ApiError } from '../services/api-client';

export default function ProfileSetupScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!currentUser) return;
    setError(undefined);
    setLoading(true);
    try {
      // fullName/phone are already set from signup; re-sending them is what
      // flips is_profile_complete server-side (see auth.routes.js PUT
      // /profile). Root layout's Stack.Protected swaps to (main) once
      // currentUser.isProfileComplete becomes true.
      await updateProfile({
        ...currentUser,
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-grow px-6 pt-10 pb-8">
        <Text className="text-2xl font-bold text-ink">{t('completeProfile')}</Text>
        <Text className="mt-1 text-text-secondary">{t('profilePhotoHint')}</Text>

        <View className="mt-8 gap-4">
          <Text className="text-sm font-medium text-ink">{t('emergencyContactOptional')}</Text>
          <Text className="text-xs text-text-secondary">{t('emergencyContactHint')}</Text>
          <Input label={t('emergencyContactName')} value={emergencyName} onChangeText={setEmergencyName} />
          <Input
            label={t('emergencyContactPhone')}
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            keyboardType="phone-pad"
          />
          {error ? <Text className="text-sm text-error">{error}</Text> : null}
        </View>

        <View className="mt-8">
          <Button title={t('continueLabel')} onPress={handleContinue} loading={loading} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
