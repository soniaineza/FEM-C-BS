import { useState } from 'react';
import { View, Text } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { goBack } from '@kimu/shared/utils/navigation';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';
import { validators } from '@kimu/shared/utils/validators';
import { ApiError } from '../../../services/api-client';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [fullName, setFullName] = useState(currentUser?.fullName ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [emergencyName, setEmergencyName] = useState(currentUser?.emergencyContactName ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(currentUser?.emergencyContactPhone ?? '');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    const nameError = validators.fullName(fullName);
    const phoneError = validators.phone(phone);
    const emailError = validators.email(email);
    const firstError = nameError || phoneError || emailError;
    if (firstError) return setError(firstError);

    setError(undefined);
    setLoading(true);
    try {
      await updateProfile({
        ...currentUser!,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.trim() || undefined,
      });
      goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell title={t('editProfile')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-2 pb-8">

        <View className="mt-6 gap-4">
          <Input label={t('fullName')} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
          <Input label={t('phoneNumber')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Input label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Input label={t('emergencyContactName')} value={emergencyName} onChangeText={setEmergencyName} />
          <Input label={t('emergencyContactPhone')} value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" />
          {error ? <Text className="font-sans text-sm text-error">{error}</Text> : null}
        </View>

        <View className="mt-8">
          <Button title={t('saveChanges')} onPress={handleSave} loading={loading} />
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
