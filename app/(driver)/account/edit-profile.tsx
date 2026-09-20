import { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { BackHeader } from '../../../components/BackHeader';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useTranslation } from '../../../hooks/useTranslation';
import { ApiError } from '../../../services/driver-api-client';

export default function DriverEditProfileScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const updateProfile = useDriverAuthStore((s) => s.updateProfile);

  const [fullName, setFullName] = useState(currentDriver?.fullName ?? '');
  const [email, setEmail] = useState(currentDriver?.email ?? '');
  const [emergencyName, setEmergencyName] = useState(currentDriver?.emergencyContactName ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(currentDriver?.emergencyContactPhone ?? '');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(undefined);
    setLoading(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.trim() || undefined,
      });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverProfileSaveFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('editProfile')}</Text>

        <View className="mt-6 gap-4">
          <Input label={t('fullName')} value={fullName} onChangeText={setFullName} prefixIcon="person-outline" />
          <Input label={t('email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" prefixIcon="mail-outline" />
          <Input label={t('phoneNumber')} value={currentDriver?.phone ?? ''} editable={false} prefixIcon="call-outline" />
        </View>

        <Text className="mt-7 text-base font-bold text-ink">{t('emergencyContactOptional')}</Text>
        <View className="mt-3 gap-4">
          <Input label={t('emergencyContactName')} value={emergencyName} onChangeText={setEmergencyName} prefixIcon="person-circle-outline" />
          <Input label={t('emergencyContactPhone')} value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" prefixIcon="call" />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-7">
          <Button title={t('save')} onPress={handleSave} loading={loading} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
