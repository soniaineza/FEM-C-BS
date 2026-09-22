import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '../../../components/Button';
import { LocationField } from '../../../components/LocationField';
import { RideMap } from '../../../components/RideMap';
import { FEMMapCard } from '../../../components/FEMMapCard';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useActiveRideRestore } from '../../../hooks/useActiveRideRestore';
import { getCurrentPlace, MapDefaults } from '../../../services/location-service';
import { getSavedPlaces } from '../../../services/user-service';
import { SavedPlace } from '../../../types/saved-place';
import { RideType } from '../../../types/ride';

function greetingKey(): 'goodMorning' | 'goodAfternoon' | 'goodEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'goodMorning';
  if (hour < 18) return 'goodAfternoon';
  return 'goodEvening';
}

// Home = greeting header + booking section + a framed map card, matching a
// production ride-hailing home: the map reads as a section of the page (never
// swallowing the screen) and the Find Ride button always stays inside the
// SafeArea above the tab bar. Booking logic (pickup/destination/ride type/
// active-ride guard) is unchanged.
export default function HomeScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const rideType = useRideWizardStore((s) => s.rideType);
  const setPickup = useRideWizardStore((s) => s.setPickup);
  const setRideType = useRideWizardStore((s) => s.setRideType);

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [mapCenter, setMapCenter] = useState(MapDefaults);
  const [mapLocating, setMapLocating] = useState(false);

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
  // addPostFrameCallback(_useCurrentLocation) — but only when the user has
  // not already chosen a pickup (saved place / manual pin). Previously this
  // fired on every remount and silently replaced a deliberately chosen
  // pickup with raw GPS.
  useEffect(() => {
    if (pickup) return;
    getCurrentPlace()
      .then((place) => {
        setPickup(place);
        setMapCenter({ latitude: place.latitude!, longitude: place.longitude!, zoom: 15 });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Greeting name: first word of the rider's full name ("Muraho, Sonia").
  const firstName = (currentUser?.fullName ?? '').trim().split(/\s+/)[0] ?? '';

  function findRide() {
    if (!canRequestRide) return;
    if (!pickup || !destination) return;
    router.push('/(main)/request/vehicle-selection');
  }

  async function recenterMap() {
    setMapLocating(true);
    try {
      const place = await getCurrentPlace();
      setMapCenter({ latitude: place.latitude!, longitude: place.longitude!, zoom: 16 });
    } catch {
      // Never block the booking flow on GPS — the map simply stays where it is.
    } finally {
      setMapLocating(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-primary" edges={['top']}>
      <StatusBar style="light" />
      <View className="bg-primary px-5 pb-6 pt-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-lg font-bold text-white" numberOfLines={1}>
              {t('homeGreetingPrefix')} {firstName}
            </Text>
            <Text className="mt-0.5 text-xs font-medium text-white/85">{t('homeHeroSub')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile')}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/20"
            onPress={() => router.push('/(main)/(tabs)/profile')}
          >
            <Ionicons name="person-outline" color="#fff" size={22} />
          </Pressable>
        </View>
      </View>

      {/* flexGrow makes the sheet fill the viewport even when content is
          short: leftover space wraps the cards instead of pooling as a dead
          white gap under the button. On small screens it simply scrolls. */}
      <ScrollView className="-mt-4 flex-1 rounded-t-[28px] bg-bg-light" contentContainerClassName="flex-grow px-5 pb-4 pt-5">
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

        {/* Framed map card: fixed aspect via responsive height, rounded
            corners, recenter control. Shows pickup when known, else Kigali
            default; never consumes the whole screen. */}
        <View className="mt-4">
          <Text className="mb-2 text-sm font-semibold text-text-secondary">{t('homeMapTitle')}</Text>
          <FEMMapCard height={160} onRecenter={recenterMap} recenterDisabled={mapLocating} recenterLabel={t('useCurrentLocation')}>
            <RideMap
              center={pickup?.latitude && pickup?.longitude ? { latitude: pickup.latitude, longitude: pickup.longitude } : mapCenter}
              zoom={15}
              markers={
                pickup?.latitude && pickup?.longitude
                  ? [{ id: 'pickup', position: { latitude: pickup.latitude, longitude: pickup.longitude }, icon: 'me' as const }]
                  : []
              }
              retryLabel={t('tryAgain')}
              loadingLabel={t('mapLoading')}
              errorLabel={t('mapError')}
            />
          </FEMMapCard>
          {mapLocating ? (
            <View className="mt-2 flex-row items-center">
              <ActivityIndicator size="small" color="#16A34A" />
              <Text className="ml-2 text-xs text-text-secondary">{t('gettingLocationPermission')}</Text>
            </View>
          ) : null}
        </View>

        <View className="mt-4 flex-1 justify-center gap-4">
          <RideOptionCard
            type="private"
            selected={rideType === 'private'}
            title={t('privateRide')}
            subtitle={t('privateRideDescription')}
            features={[
              { icon: 'person-outline', label: '1-4' },
              { icon: 'car-outline', label: 'Sedan / SUV' },
              { icon: 'shield-checkmark-outline', label: t('featureSafe') },
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
              { icon: 'car-outline', label: t('featureComfortable') },
              { icon: 'leaf-outline', label: t('featureEcoFriendly') },
            ]}
            onPress={() => setRideType('shared')}
          />
        </View>

        <View className="mt-4">
          <Button
            title={t('findRide')}
            icon="arrow-forward"
            onPress={findRide}
            disabled={!pickup || !destination || !canRequestRide}
          />
          {checking ? <Text className="mt-2 text-center text-xs text-text-secondary">{t('checkingActiveRide')}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
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
      accessibilityRole="radio"
      accessibilityState={{ selected }}
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
