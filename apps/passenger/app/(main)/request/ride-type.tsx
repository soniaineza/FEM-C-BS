import { Pressable, Text, View } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { BackHeader } from '@kimu/shared/components/BackHeader';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { RideType, rideTypeDiscountPercent } from '@kimu/shared/types/ride';

function OptionCard({
  title,
  description,
  note,
  selected,
  discount,
  onPress,
}: {
  title: string;
  description: string;
  note: string;
  selected: boolean;
  discount?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mt-4 rounded border p-4 ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-ink">{title}</Text>
        {discount ? (
          <View className="rounded-full bg-accent-soft px-2.5 py-0.5">
            <Text className="text-xs font-semibold text-accent-dark">-{discount}%</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-1 text-sm text-text-secondary">{description}</Text>
      <Text className="mt-1 text-xs text-text-secondary">{note}</Text>
    </Pressable>
  );
}

export default function RideTypeScreen() {
  const { t } = useTranslation();
  const rideType = useRideWizardStore((s) => s.rideType);
  const setRideType = useRideWizardStore((s) => s.setRideType);

  function choose(type: RideType) {
    setRideType(type);
  }

  function proceed() {
    router.push('/(main)/request/vehicle-selection');
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-1 text-xl text-ink font-display">{t('chooseRideType')}</Text>
        <Text className="mt-1 text-sm text-text-secondary">{t('rideTypeHint')}</Text>

        <OptionCard
          title={t('privateRide')}
          description={t('privateRideDescription')}
          note={t('privateRideNote')}
          selected={rideType === 'private'}
          onPress={() => choose('private')}
        />
        <OptionCard
          title={t('shareRide')}
          description={t('shareRideDescription')}
          note={t('shareRideNote')}
          selected={rideType === 'shared'}
          discount={rideTypeDiscountPercent('shared')}
          onPress={() => choose('shared')}
        />

        <View className="mt-auto pb-8">
          <Button title={t('continueLabel')} onPress={proceed} />
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
