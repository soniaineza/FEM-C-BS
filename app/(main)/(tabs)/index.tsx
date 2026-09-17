import { useCallback, useEffect, useState } from 'react';
import { View, Text, SafeAreaView, Pressable, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { LocationField } from '../../../components/LocationField';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { useActiveRideRestore } from '../../../hooks/useActiveRideRestore';
import { getCurrentPlace } from '../../../services/location-service';
import { getSavedPlaces } from '../../../services/user-service';
import { SavedPlace } from '../../../types/saved-place';
import { RideType } from '../../../types/ride';

// Matches the reference design 1:1: green banner (brand mark + profile
// button, no map on this screen), a single white rounded-top sheet holding
// the seamless pickup/dropoff card, two ride-type cards with a feature-tag
// row each, and a full-width Find Ride button.
export default function HomeScreen() {
  const { t } = useTranslation();
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const rideType = useRideWizardStore((s) => s.rideType);
  const setPickup = useRideWizardStore((s) => s.setPickup);
  const setRideType = useRideWizardStore((s) => s.setRideType);

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);

  // Restores an active ride after app restart and blocks duplicate booking:
  // while a ride is live, Home shows a resume banner and the Find Ride flow
  // is disabled. Spec: "do not allow the passenger to accidentally request
  // another ride while an active ride exists" + restart recovery.
  const { activeRide, checking, canRequestRide } = useActiveRideRestore();

  useFocusEffect(
    useCallback(() => {
      getSavedPlaces()
        .then(setSavedPlaces)
        .catch(() => {});
    }, [])
  );

  // Ask for location right away on first open, matching home_screen.dart's
  // addPostFrameCallback(_useCurrentLocation).
  useEffect(() => {
    getCurrentPlace()
      .then(setPickup)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function findRide() {
    if (!canRequestRide) return;
    if (!pickup || !destination) return;
    router.push('/(main)/request/vehicle-selection');
  }

  return (
    <SafeAreaView className="flex-1 bg-primary">
      <View className="bg-primary px-5 pb-8 pt-3">
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-white">
            <Text className="text-2xl font-bold text-primary">F</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-xl font-bold text-white">FEM C@BS</Text>
            <Text className="text-xs font-medium tracking-wide text-white/85">{t('tagline')}</Text>
          </View>
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full bg-white/20"
            onPress={() => router.push('/(main)/(tabs)/profile')}
          >
            <Ionicons name="person-outline" color="#fff" size={22} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="-mt-5 flex-1 rounded-t-[28px] bg-bg-light" contentContainerClassName="px-5 pb-6 pt-5">
        {activeRide ? (
          <Pressable
            className="mb-4 flex-row items-center rounded-2xl border border-primary bg-white p-4"
            onPress={() => router.push({ pathname: '/(main)/ride/tracking', params: { rideId: activeRide.id } })}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}>
              <Ionicons name="navigate" size={20} color="#16A34A" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[15px] font-bold text-ink">{t('activeRideTitle')}</Text>
              <Text numberOfLines={1} className="text-[13px] text-text-secondary">{activeRide.destination.address}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </Pressable>
        ) : null}

        <View className="flex-row items-center">
          <Ionicons name="location-outline" size={20} color="#111111" />
          <Text className="ml-2 text-[17px] font-bold text-ink">{t('whereGoing')}</Text>
        </View>

        <View className="mt-3.5 rounded-2xl border border-border bg-white">
          <LocationField isPickup value={pickup} placeholder={t('setPickup')} onPress={() => router.push('/(main)/request/pickup')} />
          <View className="mx-4 h-px bg-border" />
          <LocationField value={destination} placeholder={t('chooseDestination')} onPress={() => router.push('/(main)/request/destination')} />
        </View>

        {savedPlaces.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-2.5">
            {savedPlaces.map((place) => (
              <Pressable
                key={place.id}
                className="flex-row items-center rounded-xl border border-border bg-white px-3.5 py-2.5"
                onPress={() => setPickup(place.place)}
              >
                <Ionicons
                  name={place.type === 'home' ? 'home-outline' : place.type === 'work' ? 'business-outline' : 'star-outline'}
                  size={16}
                  color="#16A34A"
                />
                <Text className="ml-2 text-[13px] font-semibold text-ink">{place.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View className="mt-5 gap-3.5">
          <RideOptionCard
            type="private"
            selected={rideType === 'private'}
            title={t('privateRide')}
            subtitle={t('privateRideDescription')}
            features={[
              { icon: 'person-outline', label: '1-4' },
              { icon: 'car-outline', label: 'Sedan / SUV' },
              { icon: 'shield-checkmark-outline', label: 'Safe & Reliable' },
            ]}
            onPress={() => setRideType('private')}
          />
          <RideOptionCard
            type="shared"
            selected={rideType === 'shared'}
            title={t('shareRide')}
            subtitle={t('shareRideDescription')}
            features={[
              { icon: 'person-outline', label: '1-4' },
              { icon: 'car-outline', label: 'Comfortable' },
              { icon: 'leaf-outline', label: 'Eco Friendly' },
            ]}
            onPress={() => setRideType('shared')}
          />
        </View>

        <View className="mt-5">
          <Button
            title={t('findRide')}
            icon="arrow-forward"
            onPress={findRide}
            disabled={!pickup || !destination || !canRequestRide}
          />
          {checking ? <Text className="mt-2 text-center text-xs text-text-secondary">{t('checkingActiveRide')}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RideOptionCard({
  type,
  selected,
  title,
  subtitle,
  features,
  onPress,
}: {
  type: RideType;
  selected: boolean;
  title: string;
  subtitle: string;
  features: { icon: keyof typeof Ionicons.glyphMap; label: string }[];
  onPress: () => void;
}) {
  const isShared = type === 'shared';
  return (
    <Pressable
      className="rounded-2xl p-4"
      style={{
        backgroundColor: selected ? 'rgba(22,163,74,0.06)' : '#fff',
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? '#16A34A' : '#E5E7EB',
      }}
      onPress={onPress}
    >
      <View className="flex-row items-center">
        <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}>
          <Ionicons name={isShared ? 'people' : 'car-sport'} size={30} color="#15803D" />
        </View>
        <View className="ml-3.5 flex-1">
          <Text className="text-lg font-bold text-ink">{title}</Text>
          <Text className="mt-0.5 text-[13px] leading-4 text-text-secondary">{subtitle}</Text>
        </View>
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? '#16A34A' : '#C7CCD1'} />
      </View>
      <View className="mt-3 flex-row items-center flex-wrap gap-x-4 gap-y-1">
        {features.map((f) => (
          <View key={f.label} className="flex-row items-center">
            <Ionicons name={f.icon} size={15} color="#6B7280" />
            <Text className="ml-1 text-xs font-medium text-text-secondary">{f.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
