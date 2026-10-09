import { Pressable, Text, View } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
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
      <Text className="font-sans mt-1 text-sm text-text-secondary">{description}</Text>
      <Text className="font-sans mt-1 text-xs text-text-secondary">{note}</Text>
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
    <ScreenShell title={t('chooseRideType')} back background="bg-white" backLabel={t('back')}>
      <View className="flex-1 px-6 pt-2">
        <Text className="font-sans mt-1 text-sm text-text-secondary">{t('rideTypeHint')}</Text>

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
    </ScreenShell>
  );
}
