import { useState } from 'react';
import { View, Text, SafeAreaView, Share, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { triggerEmergency, createTripShare } from '../../../services/safety-service';

export default function SafetyScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const [sosLoading, setSosLoading] = useState(false);
  const [sosReference, setSosReference] = useState<string | undefined>();
  const [shareLoading, setShareLoading] = useState(false);

  async function handleSos() {
    setSosLoading(true);
    try {
      const result = await triggerEmergency({ rideId });
      setSosReference(result.reference);
    } finally {
      setSosLoading(false);
    }
  }

  async function handleShareTrip() {
    if (!rideId) return;
    setShareLoading(true);
    try {
      const { token } = await createTripShare(rideId);
      await Share.share({ message: `Follow my FEM C@BS trip: https://fem-cabs-api.onrender.com/share/${token}` });
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-8">
        <Text className="text-xl font-bold text-ink">{t('safety')}</Text>
        <Text className="mt-2 text-text-secondary">{t('safetyPriority')}</Text>

        <View className="mt-8 rounded border border-error p-4">
          <Text className="text-base font-semibold text-error">{t('emergencyAssistance')}</Text>
          <Text className="mt-1 text-xs text-text-secondary">{t('emergencyBody')}</Text>
          <View className="mt-3">
            <Button title="SOS" onPress={handleSos} loading={sosLoading} className="bg-error" />
          </View>
          {sosReference ? <Text className="mt-2 text-xs text-text-secondary">Ref: {sosReference}</Text> : null}
        </View>

        <View className="mt-4 rounded border border-border p-4">
          <Text className="text-base font-semibold text-ink">Share trip</Text>
          <Text className="mt-1 text-xs text-text-secondary">
            Send a live-tracking link to a trusted contact. It never exposes payment or account data.
          </Text>
          <View className="mt-3">
            <Button title="Share trip link" variant="outline" onPress={handleShareTrip} loading={shareLoading} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
