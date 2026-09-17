import { useCallback, useEffect, useState } from 'react';
import { View, Text, SafeAreaView, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { RideMap } from '../../../components/RideMap';
import { LocationField } from '../../../components/LocationField';
import { useTranslation } from '../../../hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { MapDefaults, getCurrentPlace, getRoute } from '../../../services/location-service';
import { getNearbyDrivers } from '../../../services/ride-service';
import { getSavedPlaces } from '../../../services/user-service';
import { SavedPlace } from '../../../types/saved-place';
import { RideType, rideTypeDiscountPercent } from '../../../types/ride';

// Direct port of home_screen.dart: this is the booking hub, not just a
// "start" button — gradient top banner, live map preview, an inline
// pickup/destination booking card (pickup.tsx/destination.tsx are pushed
// as sub-screens that write into the wizard store and pop back here,
// mirroring the original's Navigator.push<Place> pattern), saved places,
// ride-type cards, and Find Ride jumping straight to vehicle-selection —
// there's no separate ride-type screen in the real flow (home_screen.dart's
// _findRide() goes straight to AppRoutes.vehicleSelection).
export default function HomeScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const rideType = useRideWizardStore((s) => s.rideType);
  const setPickup = useRideWizardStore((s) => s.setPickup);
  const setRideType = useRideWizardStore((s) => s.setRideType);

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [locating, setLocating] = useState(false);
  const [routePoints, setRoutePoints] = useState<{ latitude: number; longitude: number }[]>([]);

  useFocusEffect(
    useCallback(() => {
      getSavedPlaces()
        .then(setSavedPlaces)
        .catch(() => {});
    }, [])
  );

  useEffect(() => {
    if (pickup?.latitude && pickup.longitude && destination?.latitude && destination.longitude) {
      getRoute({ from: pickup, to: destination }).then((r) => setRoutePoints(r?.points ?? []));
    } else {
      setRoutePoints([]);
    }
  }, [pickup, destination]);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const place = await getCurrentPlace();
      setPickup(place);
    } catch {
      // Non-fatal — the passenger can still set pickup manually.
    } finally {
      setLocating(false);
    }
  }

  // Ask for location right away on first open, matching home_screen.dart's
  // addPostFrameCallback(_useCurrentLocation).
  useEffect(() => {
    useCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function findRide() {
    if (!pickup || !destination) return;
    router.push('/(main)/request/vehicle-selection');
  }

  const mapCenter = pickup?.latitude && pickup?.longitude ? { latitude: pickup.latitude, longitude: pickup.longitude } : MapDefaults;
  const mapMarkers = [
    ...(pickup?.latitude && pickup.longitude ? [{ id: 'pickup', position: { latitude: pickup.latitude, longitude: pickup.longitude }, icon: 'pickup' as const }] : []),
    ...(destination?.latitude && destination.longitude ? [{ id: 'dest', position: { latitude: destination.latitude, longitude: destination.longitude }, icon: 'destination' as const }] : []),
  ];

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      {/* Top banner */}
      <View className="bg-primary px-4 pb-5 pt-3.5">
        <View className="flex-row items-center">
          <View className="h-10 w-10 items-center justify-center rounded-[10px] bg-white">
            <Text className="text-xl font-bold text-primary">F</Text>
          </View>
          <View className="ml-2.5 flex-1">
            <Text className="text-lg font-bold text-white">FEM C@BS</Text>
            <Text className="text-[11.5px] font-medium text-white/90">{t('tagline')}</Text>
          </View>
          <Pressable
            className="h-10 w-10 items-center justify-center rounded-full bg-white/[0.18]"
            onPress={() => router.push('/(main)/(tabs)/profile')}
          >
            <Ionicons name="person-outline" color="#fff" size={22} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-6 pt-4" className="flex-1">
        {/* Map preview */}
        <View className="h-[180px] w-full overflow-hidden rounded-2xl">
          <RideMap center={mapCenter} markers={mapMarkers} routePolyline={routePoints} />
          <Pressable
            className="absolute bottom-2.5 right-2.5 h-10 w-10 items-center justify-center rounded-full bg-white"
            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}
            onPress={useCurrentLocation}
          >
            {locating ? <ActivityIndicator color="#16A34A" size="small" /> : <Ionicons name="locate" size={20} color="#16A34A" />}
          </Pressable>
        </View>

        {/* Booking card */}
        <View
          className="mt-4 rounded-2xl border border-border bg-white p-4"
          style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }}
        >
          <View className="flex-row items-center">
            <Ionicons name="location-outline" size={20} color="#111111" />
            <Text className="ml-2 text-[17px] font-bold text-ink">{t('whereGoing')}</Text>
          </View>

          <View className="mt-3.5 gap-2.5">
            <LocationField
              label={t('pickup')}
              value={pickup}
              isPickup
              placeholder={t('setPickup')}
              onPress={() => router.push('/(main)/request/pickup')}
            />
            <LocationField
              label={t('destination')}
              value={destination}
              placeholder={t('chooseDestination')}
              onPress={() => router.push('/(main)/request/destination')}
            />
          </View>

          {locating ? (
            <View className="mt-2.5 flex-row items-center">
              <ActivityIndicator size="small" color="#16A34A" />
              <Text className="ml-2.5 text-[13px] text-text-secondary">{t('findingLocation')}</Text>
            </View>
          ) : null}

          {savedPlaces.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1" contentContainerClassName="gap-2.5">
              {savedPlaces.map((place) => (
                <Pressable
                  key={place.id}
                  className="flex-row items-center rounded-xl border border-border px-3.5 py-3"
                  onPress={() => setPickup(place.place)}
                >
                  <Ionicons
                    name={place.type === 'home' ? 'home-outline' : place.type === 'work' ? 'business-outline' : 'star-outline'}
                    size={18}
                    color="#16A34A"
                  />
                  <Text className="ml-2 text-[13px] font-semibold text-ink">{place.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* Ride type cards */}
        <View className="mt-5 gap-3">
          <RideOptionCard
            type="private"
            selected={rideType === 'private'}
            title={t('privateRide')}
            subtitle={t('privateRideDescription')}
            onPress={() => setRideType('private')}
          />
          <RideOptionCard
            type="shared"
            selected={rideType === 'shared'}
            title={t('shareRide')}
            subtitle={t('shareRideDescription')}
            onPress={() => setRideType('shared')}
          />
        </View>

        <View className="mt-5">
          <Button title={t('findRide')} icon="arrow-forward" onPress={findRide} disabled={!pickup || !destination} />
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
  onPress,
}: {
  type: RideType;
  selected: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const isShared = type === 'shared';
  return (
    <Pressable
      className="rounded-2xl p-3.5"
      style={{
        backgroundColor: selected ? 'rgba(22,163,74,0.06)' : '#fff',
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? '#16A34A' : '#E5E7EB',
      }}
      onPress={onPress}
    >
      <View className="flex-row items-center">
        <View
          className="h-[46px] w-[46px] items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}
        >
          <Ionicons name={isShared ? 'people-outline' : 'car-sport-outline'} size={22} color="#15803D" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-ink">{title}</Text>
          <Text className="mt-0.5 text-[12.5px] leading-4 text-text-secondary">{subtitle}</Text>
        </View>
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? '#16A34A' : '#6B7280'} />
      </View>
      <View className="mt-2.5 flex-row items-center">
        <Ionicons name="person-outline" size={16} color="#6B7280" />
        <Text className="ml-1 text-xs font-semibold text-text-secondary">1-4</Text>
        <View className="w-4" />
        <Ionicons name={isShared ? 'people-outline' : 'car-outline'} size={16} color="#6B7280" />
        {isShared ? (
          <Text className="ml-1 text-xs font-semibold text-primary">-{rideTypeDiscountPercent('shared')}%</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
