import { useState } from 'react';
import { View, Text } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useAuthStore } from '../stores/useAuthStore';
import { ApiError } from '../services/api-client';

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Direct port of lib/screens/auth/profile_setup_screen.dart: an avatar circle
// (initials derived from the name, green-tinted), editable name/phone/email
// (pre-filled from signup), and an optional emergency contact section.
export default function ProfileSetupScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const [fullName, setFullName] = useState(currentUser?.fullName ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!currentUser) return;
    setError(undefined);
    setLoading(true);
    try {
      await updateProfile({
        ...currentUser,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.trim() || undefined,
      });
      // Root layout's Stack.Protected swaps to (main) once
      // currentUser.isProfileComplete becomes true.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-6 pb-8">
        <Text className="text-xl text-ink font-display">{t('completeProfile')}</Text>

        <View className="mt-6 items-center">
          <View
            className="h-[88px] w-[88px] items-center justify-center rounded-full border-2 border-primary"
            style={{ backgroundColor: 'rgba(14,124,74,0.12)' }}
          >
            <Text className="text-3xl font-bold text-primary">{initialsFor(fullName)}</Text>
          </View>
          <Text className="mt-3 text-center text-xs text-text-secondary">{t('profilePhotoHint')}</Text>
        </View>

        <View className="mt-6 gap-4">
          <Input label={t('fullName')} value={fullName} onChangeText={setFullName} prefixIcon="person-outline" />
          <Input
            label={t('phoneNumber')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            prefixIcon="call-outline"
          />
          <Input
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            prefixIcon="mail-outline"
          />
        </View>

        <Text className="mt-7 text-base font-bold text-ink">{t('emergencyContactOptional')}</Text>
        <Text className="mt-1.5 text-xs leading-5 text-text-secondary">{t('emergencyContactHint')}</Text>
        <View className="mt-4 gap-4">
          <Input
            label={t('emergencyContactName')}
            value={emergencyName}
            onChangeText={setEmergencyName}
            prefixIcon="person-circle-outline"
          />
          <Input
            label={t('emergencyContactPhone')}
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            keyboardType="phone-pad"
            prefixIcon="call"
          />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-7">
          <Button title={t('continueLabel')} onPress={handleContinue} loading={loading} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
