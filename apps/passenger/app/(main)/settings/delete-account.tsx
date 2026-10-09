import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';
import { ApiError } from '../../../services/api-client';

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setError(undefined);
    setLoading(true);
    try {
      await deleteAccount();
      // Root layout's Stack.Protected swaps to (auth) automatically once
      // currentUser becomes null.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('deleteFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell title={t('deleteYourAccount')} back background="bg-white" backLabel={t('back')}>
      <View className="flex-1 px-6 pt-2">
        <Text className="font-sans mt-3 text-text-secondary">{t('deleteAccountBody')}</Text>

        <Pressable className="mt-6 flex-row items-start" onPress={() => setConfirmed((v) => !v)}>
          <Ionicons name={confirmed ? 'checkbox' : 'checkbox-outline'} size={22} color={confirmed ? '#DC2626' : '#6B7280'} />
          <Text className="font-sans ml-2.5 flex-1 text-sm leading-5 text-ink">{t('deleteConfirm')}</Text>
        </Pressable>

        {error ? (
          <View className="mt-4">
            <ErrorMessage message={error} />
          </View>
        ) : null}

        <View className="mt-8">
          <Button
            title={t('deleteMyAccount')}
            destructive
            onPress={handleDelete}
            loading={loading}
            disabled={!confirmed}
          />
        </View>
      </View>
    </ScreenShell>
  );
}
