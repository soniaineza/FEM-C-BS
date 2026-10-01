import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, AppState, useWindowDimensions } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '../../../components/Button';
import { LocationField } from '../../../components/LocationField';
import { RideMap } from '../../../components/RideMap';
import { MapSheet } from '../../../components/map/MapSheet';
import { Colors } from '../../../constants/theme';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useActiveRideRestore } from '../../../hooks/useActiveRideRestore';
import { useNearbyCars } from '../../../hooks/useNearbyCars';
import { ensureLocationAccess } from '../../../utils/location-access';
import { getCurrentPlace, MapDefaults } from '../../../services/location-service';
import { getSavedPlaces } from '../../../services/user-service';
import { SavedPlace } from '../../../types/saved-place';
import { placeHasCoordinates } from '../../../types/place';

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

  // Fill in the pickup from GPS once location is approved. Runs on arrival and
  // again whenever the app returns to the foreground, so approving location in
  // the system Settings (via the dialog's "Open settings") takes effect at once.
  const pickupSet = !!pickup;
  useEffect(() => {
    if (pickupSet) return;
    let alive = true;
    async function locate() {
      if ((await ensureLocationAccess(t)) !== 'granted') return;
      try {
        const place = await getCurrentPlace();
        if (!alive) return;
        setPickup(place);
        setMapCenter({ latitude: place.latitude!, longitude: place.longitude!, zoom: 15 });
      } catch {}
    }
    locate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') locate();
    });
    return () => {
      alive = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupSet]);

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
      // The locate button is an explicit request: walk through approval.
      if ((await ensureLocationAccess(t, { interactive: true })) !== 'granted') return;
      const place = await getCurrentPlace();
      setMapCenter({ latitude: place.latitude!, longitude: place.longitude!, zoom: 16 });
      setRecenterToken((n) => n + 1);
    } catch {
      // Never block the booking flow on GPS — the map simply stays where it is.
    } finally {
      setMapLocating(false);
    }
  }

  const sheetMaxHeight = Math.min(420, Math.max(280, screenHeight * 0.48));

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

        <View className="absolute left-3 right-3 top-3 sm:left-4 sm:right-4 flex-row items-start justify-between gap-3" pointerEvents="box-none">
          <View className="max-w-[75%] flex-1 rounded-2xl bg-primary px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm">
            <Text className="text-sm sm:text-base font-bold text-white" numberOfLines={1}>{t('homeGreetingPrefix')} {firstName}</Text>
            <Text className="mt-0.5 text-[11px] sm:text-xs font-medium text-white/80">
              {nearbyCars.length === 1 ? t('oneDriverNearby') : t('multipleDriversNearby', { count: nearbyCars.length })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile')}
            className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full bg-primary shadow-sm"
            onPress={() => router.push('/(main)/(tabs)/profile')}
          >
            <Ionicons name="person-outline" color="#FFFFFF" size={22} />
          </Pressable>
        </View>

        <MapSheet
          backgroundColor={Colors.primary}
          handleColor="rgba(255,255,255,0.45)"
          bottomInset={12}
          maxHeight={sheetMaxHeight}
          expandLabel={t('rideOptions')}
          collapseLabel={t('showMap')}
          floating={
            <View className="flex-row justify-end px-3 sm:px-4" pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('useCurrentLocation')}
                disabled={mapLocating}
                onPress={recenterMap}
                className="h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary shadow-sm"
                style={{ opacity: mapLocating ? 0.5 : 1 }}
              >
                {mapLocating ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="locate" size={22} color="#FFFFFF" />}
              </Pressable>
            </View>
          }
          header={
            <View className="flex-row items-center pb-1">
              <Ionicons name="location-outline" size={20} color="#FFFFFF" />
              <Text className="ml-2 text-[17px] text-white font-display">{t('whereGoing')}</Text>
            </View>
          }
          footer={
            <View>
              <Button
                title={t('findRide')}
                icon="arrow-forward"
                onPress={findRide}
                disabled={!pickup || !destination || !canRequestRide}
              />
              {checking ? <Text className="mt-2 text-center text-xs text-white/80">{t('checkingActiveRide')}</Text> : null}
            </View>
          }
        >
          <View className="pt-2">
            {activeRide ? (
              <Pressable
                className="mb-4 flex-row items-center rounded-2xl border border-white/30 bg-white/15 p-4"
                onPress={() => router.push({ pathname: '/(main)/ride/tracking', params: { rideId: activeRide.id } })}
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Ionicons name="navigate" size={20} color="#FFFFFF" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[15px] font-bold text-white">{t('activeRideTitle')}</Text>
                  <Text numberOfLines={1} className="text-[13px] text-white/80">{activeRide.destination.address}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}

            <View className="rounded-2xl border border-white/30 bg-white/20 p-1">
              <LocationField isPickup value={pickup} placeholder={t('setPickup')} onPress={() => router.push('/(main)/request/pickup')} />
              <View className="mx-4 h-px bg-white/25" />
              <LocationField value={destination} placeholder={t('chooseDestination')} onPress={() => router.push('/(main)/request/destination')} />
            </View>

            {savedPlaces.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-2.5">
                {savedPlaces.map((place) => (
                  <Pressable
                    key={place.id}
                    className="flex-row items-center rounded-xl border border-white/25 bg-white/10 px-3.5 py-2.5"
                    onPress={() => {
                      setPickup(place.place);
                      // Older saved places may have an address but no map point.
                      // Let the rider pin the exact pickup before booking.
                      if (!placeHasCoordinates(place.place)) router.push('/(main)/request/pickup');
                    }}
                  >
                    <Ionicons
                      name={place.type === 'home' ? 'home-outline' : place.type === 'work' ? 'business-outline' : 'star-outline'}
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text className="ml-2 text-[13px] font-semibold text-white">{place.name}</Text>
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
            <Text className="mb-1 mt-2 text-xs text-white/80">
              {rideType === 'private' ? t('privateRideDescription') : t('shareRideDescription')}
            </Text>
          </View>
        </MapSheet>
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
      className="min-h-11 sm:min-h-12 flex-1 flex-row items-center justify-center rounded-xl px-2 sm:px-3 py-2.5 sm:py-3"
      style={{
        backgroundColor: selected ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: selected ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
      }}
      onPress={onPress}
    >
      <Ionicons name={icon} size={19} color={selected ? Colors.primary : '#FFFFFF'} />
      <Text className={`ml-2 text-sm font-semibold ${selected ? 'text-primary' : 'text-white'}`}>{title}</Text>
    </Pressable>
  );
}
