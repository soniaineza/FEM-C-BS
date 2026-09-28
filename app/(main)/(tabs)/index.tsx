import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '../../../components/Button';
import { LocationField } from '../../../components/LocationField';
import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useActiveRideRestore } from '../../../hooks/useActiveRideRestore';
import { useNearbyCars } from '../../../hooks/useNearbyCars';
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

// Keep the live fleet visible on arrival. Booking sits in a compact panel
// above the tab bar; longer choices scroll within the panel.
export default function HomeScreen() {
  const { t } = useTranslation();
  const { height: screenHeight } = useWindowDimensions();
  const currentUser = useAuthStore((s) => s.currentUser);
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const rideType = useRideWizardStore((s) => s.rideType);
  const setPickup = useRideWizardStore((s) => s.setPickup);
  const setRideType = useRideWizardStore((s) => s.setRideType);

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [mapCenter, setMapCenter] = useState(MapDefaults);
  const [mapLocating, setMapLocating] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);

  // Restores an active ride after app restart and blocks duplicate booking:
  // while a ride is live, Home shows a resume banner and the Find Ride flow
  // is disabled. Spec: "do not allow the passenger to accidentally request
  // another ride while an active ride exists" + restart recovery.
  const { activeRide, checking, canRequestRide } = useActiveRideRestore();

  // Live cars around the rider on the full home map, polled only while Home is
  // on screen.
  const isFocused = useIsFocused();
  const mapPoint = pickup?.latitude != null && pickup?.longitude != null
    ? { latitude: pickup.latitude, longitude: pickup.longitude }
    : { latitude: mapCenter.latitude, longitude: mapCenter.longitude };
  const { cars: nearbyCars, serverTimeOffsetMs } = useNearbyCars(mapPoint, isFocused);

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

  useEffect(() => {
    if (pickup?.latitude != null && pickup?.longitude != null) {
      setMapCenter({ latitude: pickup.latitude, longitude: pickup.longitude, zoom: 15 });
    }
  }, [pickup?.latitude, pickup?.longitude]);

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
      setRecenterToken((n) => n + 1);
    } catch {
      // Never block the booking flow on GPS — the map simply stays where it is.
    } finally {
      setMapLocating(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white" edges={['top']}>
      {isFocused ? <StatusBar style="dark" /> : null}
      <View className="flex-1 bg-gray-light">
        <RideMap
          center={mapCenter}
          zoom={mapCenter.zoom ?? 15}
          recenterToken={recenterToken}
          markers={pickup?.latitude != null && pickup?.longitude != null
            ? [{ id: 'pickup', position: { latitude: pickup.latitude, longitude: pickup.longitude }, icon: 'me' as const }]
            : []}
          cars={nearbyCars}
          serverTimeOffsetMs={serverTimeOffsetMs}
          retryLabel={t('tryAgain')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
          rounded={false}
        />

        <View className="absolute left-4 right-4 top-3 flex-row items-start justify-between" pointerEvents="box-none">
          <View className="max-w-[78%] rounded-2xl bg-white px-4 py-3 shadow-sm">
            <Text className="text-base font-bold text-ink" numberOfLines={1}>{t('homeGreetingPrefix')} {firstName}</Text>
            <Text className="mt-0.5 text-xs font-medium text-text-secondary">{t('carsNearby', { count: nearbyCars.length })}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile')}
            className="h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm"
            onPress={() => router.push('/(main)/(tabs)/profile')}
          >
            <Ionicons name="person-outline" color="#111111" size={22} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('useCurrentLocation')}
          disabled={mapLocating}
          onPress={recenterMap}
          className="absolute right-4 h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm"
          style={{ bottom: Math.min(380, Math.max(270, screenHeight * 0.42)) + 14, opacity: mapLocating ? 0.5 : 1 }}
        >
          {mapLocating ? <ActivityIndicator color="#16A34A" /> : <Ionicons name="locate" size={22} color="#16A34A" />}
        </Pressable>

        <View
          className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-[28px] bg-white"
          style={{ maxHeight: Math.min(380, Math.max(270, screenHeight * 0.42)), elevation: 12, shadowColor: '#111827', shadowOpacity: 0.12, shadowRadius: 18 }}
        >
          <View className="items-center pt-2"><View className="h-1 w-10 rounded-full bg-border" /></View>
          <ScrollView className="px-5" contentContainerClassName="pb-2 pt-3" keyboardShouldPersistTaps="handled">
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

        <View className="mt-4 flex-row gap-2" accessibilityRole="radiogroup">
          <RideOptionCard
            selected={rideType === 'private'}
            title={t('privateRide')}
            icon="car-sport-outline"
            onPress={() => setRideType('private')}
          />
          <RideOptionCard
            selected={rideType === 'shared'}
            title={t('shareRide')}
            icon="people-outline"
            onPress={() => setRideType('shared')}
          />
        </View>
        <Text className="mt-2 text-xs text-text-secondary">
          {rideType === 'private' ? t('privateRideDescription') : t('shareRideDescription')}
        </Text>

          </ScrollView>
          <View className="border-t border-border bg-white px-5 pb-4 pt-3">
          <Button
            title={t('findRide')}
            icon="arrow-forward"
            onPress={findRide}
            disabled={!pickup || !destination || !canRequestRide}
          />
          {checking ? <Text className="mt-2 text-center text-xs text-text-secondary">{t('checkingActiveRide')}</Text> : null}
          </View>
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}

function RideOptionCard({
  selected,
  title,
  icon,
  onPress,
}: {
  selected: boolean;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={title}
      className="min-h-12 flex-1 flex-row items-center justify-center rounded-xl px-3 py-3"
      style={{
        backgroundColor: selected ? 'rgba(22,163,74,0.06)' : '#fff',
        borderWidth: 1,
        borderColor: selected ? '#16A34A' : '#E5E7EB',
      }}
      onPress={onPress}
    >
      <Ionicons name={icon} size={19} color={selected ? '#15803D' : '#6B7280'} />
      <Text className={`ml-2 text-sm font-semibold ${selected ? 'text-primary' : 'text-ink'}`}>{title}</Text>
    </Pressable>
  );
}
