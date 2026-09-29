import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { RideType, rideTypeDiscountPercent } from '../../../types/ride';

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
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={title}
      className={`mt-4 rounded-2xl border p-4 ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-body font-semibold text-fg">{title}</Text>
        {discount ? (
          <View className="rounded bg-primary px-2 py-0.5">
            <Text className="text-caption font-semibold text-white">-{discount}%</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-1 text-subhead text-fg-muted">{description}</Text>
      <Text className="mt-1 text-caption text-fg-muted">{note}</Text>
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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <ScrollView contentContainerClassName="flex-grow px-5 pt-2 pb-8" keyboardShouldPersistTaps="handled">
        <ScreenHeader back title={t('chooseRideType')} />
        <Text className="mt-1 text-subhead text-fg-muted">{t('rideTypeHint')}</Text>

        <View accessibilityRole="radiogroup">
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
        </View>

        <View className="mt-auto pt-8">
          <Button title={t('continueLabel')} onPress={proceed} />
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
