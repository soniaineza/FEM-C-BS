import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '../../../components/Button';
import { LocationField } from '../../../components/LocationField';
import { RideMap } from '../../../components/RideMap';
import { MapSheet } from '../../../components/map/MapSheet';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useActiveRideRestore } from '../../../hooks/useActiveRideRestore';
import { useNearbyCars } from '../../../hooks/useNearbyCars';
import { getCurrentPlace, MapDefaults } from '../../../services/location-service';
import { getSavedPlaces } from '../../../services/user-service';
import { SavedPlace } from '../../../types/saved-place';
import { placeHasCoordinates } from '../../../types/place';
import { Colors, Elevation } from '../../../constants/theme';

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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface" edges={['top']}>
      {isFocused ? <StatusBar style="dark" /> : null}
      <View className="flex-1 bg-surface-muted">
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
          <View className="max-w-[78%] rounded-2xl bg-surface px-4 py-3" style={Elevation[2]}>
            <Text className="text-headline font-semibold text-fg" numberOfLines={1}>{t('homeGreetingPrefix')} {firstName}</Text>
            <View className="mt-1 flex-row items-center">
              <View className="mr-1.5 h-2 w-2 rounded-full bg-primary" />
              <Text className="text-caption font-medium text-fg-muted">
              {nearbyCars.length === 1 ? t('oneDriverNearby') : t('multipleDriversNearby', { count: nearbyCars.length })}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile')}
            className="h-12 w-12 items-center justify-center rounded-full bg-surface"
            style={Elevation[2]}
            onPress={() => router.push('/(main)/(tabs)/profile')}
          >
            <Ionicons name="person-outline" color={Colors.fg} size={22} />
          </Pressable>
        </View>

        <MapSheet
          bottomInset={12}
          maxHeight={Math.max(300, screenHeight * 0.62)}
          expandLabel={t('rideOptions')}
          collapseLabel={t('showMap')}
          floating={
            <View className="flex-row justify-end px-4" pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('useCurrentLocation')}
                disabled={mapLocating}
                onPress={recenterMap}
                className="h-12 w-12 items-center justify-center rounded-full bg-surface"
                style={{ ...Elevation[2], opacity: mapLocating ? 0.5 : 1 }}
              >
                {mapLocating ? <ActivityIndicator color={Colors.primary} /> : <Ionicons name="locate" size={22} color={Colors['primary-text']} />}
              </Pressable>
            </View>
          }
          header={
            <View className="pb-1">
              {activeRide ? (
                <Pressable
                  className="mb-4 flex-row items-center rounded-2xl bg-primary-soft p-4"
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(main)/ride/tracking', params: { rideId: activeRide.id } })}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: Colors['primary-tint'] }}>
                    <Ionicons name="navigate" size={20} color={Colors['primary-text']} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-callout font-semibold text-fg">{t('activeRideTitle')}</Text>
                    <Text numberOfLines={1} className="text-footnote text-fg-muted">{activeRide.destination.address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors['fg-muted']} />
                </Pressable>
              ) : null}

              <Text className="text-title-2 text-fg font-display">{t('whereGoing')}</Text>

              <View className="mt-3 overflow-hidden rounded-2xl bg-surface-muted">
                <LocationField isPickup value={pickup} placeholder={t('setPickup')} onPress={() => router.push('/(main)/request/pickup')} />
                <View className="ml-12 mr-4 h-px bg-border" />
                <LocationField value={destination} placeholder={t('chooseDestination')} onPress={() => router.push('/(main)/request/destination')} />
              </View>
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
              {checking ? <Text className="mt-2 text-center text-caption text-fg-muted">{t('checkingActiveRide')}</Text> : null}
            </View>
          }
        >
          {savedPlaces.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-2.5">
              {savedPlaces.map((place) => (
                <Pressable
                  key={place.id}
                  className="flex-row items-center rounded-full border border-border bg-surface px-3.5 py-2"
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
                    color={Colors['primary-text']}
                  />
                  <Text className="ml-1.5 text-footnote font-semibold text-fg">{place.name}</Text>
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
          <Text className="mb-1 mt-2 text-caption text-fg-muted">
            {rideType === 'private' ? t('privateRideDescription') : t('shareRideDescription')}
          </Text>
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
      className="min-h-12 flex-1 flex-row items-center justify-center rounded-2xl px-3 py-3"
      style={{
        backgroundColor: selected ? Colors['primary-soft'] : Colors.surface,
        borderWidth: 1.5,
        borderColor: selected ? Colors.primary : Colors.border,
      }}
      onPress={onPress}
    >
      <Ionicons name={icon} size={19} color={selected ? Colors['primary-hover'] : Colors['fg-muted']} />
      <Text className={`ml-2 text-subhead font-semibold ${selected ? 'text-primary-text' : 'text-fg'}`}>{title}</Text>
    </Pressable>
  );
}
