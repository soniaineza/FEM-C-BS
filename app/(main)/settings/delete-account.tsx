import { useState } from 'react';
import { View, Text, SafeAreaView, Pressable } from 'react-native';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
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
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-xl font-bold text-error">{t('deleteYourAccount')}</Text>
        <Text className="mt-3 text-text-secondary">{t('deleteAccountBody')}</Text>

        <Pressable className="mt-6 flex-row items-center gap-3" onPress={() => setConfirmed((v) => !v)}>
          <View className={`h-5 w-5 rounded border ${confirmed ? 'border-error bg-error' : 'border-border'}`} />
          <Text className="flex-1 text-sm text-ink">{t('deleteConfirm')}</Text>
        </Pressable>

        {error ? <Text className="mt-3 text-sm text-error">{error}</Text> : null}

        <View className="mt-8">
          <Button
            title={t('deleteMyAccount')}
            className="bg-error"
            onPress={handleDelete}
            loading={loading}
            disabled={!confirmed}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
