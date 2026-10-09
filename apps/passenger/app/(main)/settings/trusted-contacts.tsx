import { useState } from 'react';
import { View, Text } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';
import { ApiError } from '../../../services/api-client';
import { appAlert } from '@kimu/shared/utils/dialog';

// A trusted contact Kimu can reach for the rider in an emergency, and who a
// trip can be shared with. Backed by the passenger's emergency-contact fields.
export default function TrustedContactsScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [name, setName] = useState(currentUser?.emergencyContactName ?? '');
  const [phone, setPhone] = useState(currentUser?.emergencyContactPhone ?? '');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!currentUser) return;
    setError(undefined);
    setLoading(true);
    try {
      await updateProfile({
        ...currentUser,
        emergencyContactName: name.trim() || undefined,
        emergencyContactPhone: phone.trim() || undefined,
      });
      appAlert(t('trustedContactSaved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell title={t('drawerTrustedContacts')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pb-10 pt-2">
        <View className="w-full max-w-[440px] self-center">
          <Text className="font-sans mt-2 leading-relaxed text-text-secondary">{t('trustedContactsIntro')}</Text>

          <View className="mt-5 flex-row items-center rounded-2xl bg-primary/5 p-3.5">
            <Ionicons name="shield-checkmark-outline" size={20} color="#0E7C4A" />
            <Text className="font-sans ml-2.5 flex-1 text-xs leading-5 text-text-secondary">{t('trustedContactsHint')}</Text>
          </View>

          <View className="mt-5 gap-4">
            <Input label={t('emergencyContactName')} value={name} onChangeText={setName} prefixIcon="person-outline" />
            <Input label={t('emergencyContactPhone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" prefixIcon="call-outline" />
          </View>
          {error ? <View className="mt-3"><ErrorMessage message={error} /></View> : null}
          <View className="mt-6">
            <Button title={t('saveChanges')} onPress={save} loading={loading} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
