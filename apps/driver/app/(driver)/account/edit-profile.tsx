import { useState } from 'react';
import { View, Text } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { goBack } from '@kimu/shared/utils/navigation';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
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
      goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverProfileSaveFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell title={t('editProfile')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pt-2 pb-10">

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
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
