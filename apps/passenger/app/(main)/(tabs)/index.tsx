import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@kimu/shared/components/Button';
import { LocationField } from '../../../components/LocationField';
import { RideMap } from '@kimu/shared/components/RideMap';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { useDrawerStore } from '../../../stores/useDrawerStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useActiveRideRestore } from '../../../hooks/useActiveRideRestore';
import { useNearbyCars } from '../../../hooks/useNearbyCars';
import { getCurrentPlace, getSeedPlace, MapDefaults } from '@kimu/shared/services/location-service';
import { useLocationPermission } from '../../../hooks/useLocationPermission';
import { getSavedPlaces } from '../../../services/user-service';
import { SavedPlace } from '../../../types/saved-place';
import { placeHasCoordinates } from '@kimu/shared/types/place';

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

  const { ensurePermission } = useLocationPermission();

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [mapCenter, setMapCenter] = useState(MapDefaults);
  const [mapLocating, setMapLocating] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  // Shown inline under the pickup field when location is unavailable, so the
  // rider knows why it is empty instead of the failure passing silently.
  const [locationHint, setLocationHint] = useState<string | null>(null);

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

  // Fill the pickup field from the device location.
  //
  // Runs on every focus while pickup is still empty, not just once on mount, so
  // granting the permission in Settings and coming back fills it in rather than
  // leaving the rider on the Kigali default until a restart. ensurePermission()
  // is shared and single-flighted, so this never races the app-start prompt
  // raised by (main)/_layout.tsx.
  useFocusEffect(
    useCallback(() => {
      if (pickup) return;
      let cancelled = false;

      const apply = (place: Awaited<ReturnType<typeof getCurrentPlace>>) => {
        if (cancelled || place.latitude == null || place.longitude == null) return;
        setPickup(place);
        setMapCenter({ latitude: place.latitude, longitude: place.longitude, zoom: 15 });
      };

      (async () => {
        const granted = await ensurePermission();
        if (cancelled || !granted) return;

        // Move the map off the default straight away using the device's last
        // known fix, then refine it once a real reading lands.
        const seed = await getSeedPlace();
        if (seed) apply(seed);

        try {
          apply(await getCurrentPlace());
        } catch {
          // Permission is granted but no fix arrived (indoors, GPS warming up).
          // The seed above may already be showing; either way manual entry and
          // dragging the map both still work, so this is not worth a dialog.
          if (!cancelled && !seed) setLocationHint(t('couldNotReadLocationSetManual'));
        }
      })();

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickup, ensurePermission, t])
  );

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
    setLocationHint(null);
    try {
      // An explicit tap is the one place it is right to re-ask: the rider just
      // said they want their location, so a prior "Not now" deserves a retry.
      if (!(await ensurePermission({ interactive: true }))) return;
      // force: skip the cache — the rider tapped because the pin looks wrong.
      const place = await getCurrentPlace({ force: true });
      if (place.latitude == null || place.longitude == null) return;
      setPickup(place);
      setMapCenter({ latitude: place.latitude, longitude: place.longitude, zoom: 16 });
      setRecenterToken((n) => n + 1);
    } catch {
      // Never block the booking flow on GPS — the map stays where it is and the
      // rider can drag it or type the address.
      setLocationHint(t('couldNotReadLocationSetManual'));
    } finally {
      setMapLocating(false);
    }
  }

  const sheetMaxHeight = Math.min(420, Math.max(280, screenHeight * 0.48));
  // The booking panel covers the bottom of the map: tell the map how much, so
  // the rider's position (and the cars around it) are centred in the part
  // of the map they can actually see rather than hidden under the panel.
  const [sheetHeight, setSheetHeight] = useState(0);
  const mapPadding = useMemo(
    () => ({ top: 96, bottom: (sheetHeight || sheetMaxHeight) + 16, left: 24, right: 24 }),
    [sheetHeight, sheetMaxHeight]
  );

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
          padding={mapPadding}
          retryLabel={t('tryAgain')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
          rounded={false}
        />

        <View className="absolute left-3 right-3 top-3 sm:left-4 sm:right-4 flex-row items-start gap-3" pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('menu')}
            className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full border border-border bg-white shadow-sm"
            onPress={() => useDrawerStore.getState().setOpen(true)}
          >
            <Ionicons name="menu" color="#0E7C4A" size={24} />
          </Pressable>
          <View className="flex-1 rounded-2xl border border-border bg-white px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm">
            <Text className="text-sm sm:text-base font-bold text-ink" numberOfLines={1}>{t('homeGreetingPrefix')} {firstName}</Text>
            <Text className="mt-0.5 text-[11px] sm:text-xs font-medium text-primary">
              {nearbyCars.length === 1 ? t('oneDriverNearby') : t('multipleDriversNearby', { count: nearbyCars.length })}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('useCurrentLocation')}
          disabled={mapLocating}
          onPress={recenterMap}
          className="absolute right-3 sm:right-4 h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-border bg-white shadow-sm"
          style={{ bottom: sheetMaxHeight + 14, opacity: mapLocating ? 0.5 : 1 }}
        >
          {mapLocating ? <ActivityIndicator color="#0E7C4A" /> : <Ionicons name="locate" size={22} color="#0E7C4A" />}
        </Pressable>

        <View
          className="absolute bottom-0 left-0 right-0 overflow-hidden rounded-t-[28px] bg-white"
          style={{ maxHeight: sheetMaxHeight, elevation: 12, shadowColor: '#111827', shadowOpacity: 0.12, shadowRadius: 18 }}
          onLayout={(e) => setSheetHeight(Math.round(e.nativeEvent.layout.height))}
        >
          <View className="items-center pt-2"><View className="h-1 w-10 rounded-full bg-border" /></View>
          <ScrollView className="px-4 sm:px-5" contentContainerClassName="pb-2 pt-3" keyboardShouldPersistTaps="handled">
        {activeRide ? (
          <Pressable
            className="mb-4 flex-row items-center rounded-2xl border border-accent/30 bg-accent-soft p-4"
            onPress={() => router.push({ pathname: '/(main)/ride/tracking', params: { rideId: activeRide.id } })}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
              <Ionicons name="navigate" size={20} color="#F97316" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[15px] font-bold text-ink">{t('activeRideTitle')}</Text>
              <Text numberOfLines={1} className="font-sans text-[13px] text-text-secondary">{activeRide.destination.address}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C2410C" />
          </Pressable>
        ) : null}

        <View className="flex-row items-center">
          <Ionicons name="location-outline" size={20} color="#0E7C4A" />
          <Text className="ml-2 text-[17px] text-ink font-display">{t('whereGoing')}</Text>
        </View>

        <View className="mt-3.5 rounded-2xl border border-border bg-gray-light p-1">
          <LocationField isPickup value={pickup} placeholder={t('setPickup')} onPress={() => router.push('/(main)/request/pickup')} />
          <View className="mx-4 h-px bg-border" />
          <LocationField value={destination} placeholder={t('chooseDestination')} onPress={() => router.push('/(main)/request/destination')} />
        </View>

        {locationHint && !pickup ? (
          <Text className="font-sans mt-2 px-1 text-xs leading-4 text-text-secondary">{locationHint}</Text>
        ) : null}

        {savedPlaces.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-2.5">
            {savedPlaces.map((place) => (
              <Pressable
                key={place.id}
                className="flex-row items-center rounded-full border border-border bg-white px-3.5 py-2"
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
                  color="#0E7C4A"
                />
                <Text className="ml-2 text-[13px] font-semibold text-ink">{place.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <Text className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t('selectYourRide')}</Text>
        <View className="mt-2.5 flex-row gap-3" accessibilityRole="radiogroup">
          <RideOptionCard
            selected={rideType === 'private'}
            title={t('privateRide')}
            subtitle={t('privateRideShort')}
            icon="car-sport"
            onPress={() => setRideType('private')}
          />
          <RideOptionCard
            selected={rideType === 'shared'}
            title={t('shareRide')}
            subtitle={t('shareRideShort')}
            icon="people"
            onPress={() => setRideType('shared')}
          />
        </View>
        <Text className="font-sans mt-2.5 text-xs leading-4 text-text-secondary">
          {rideType === 'private' ? t('privateRideDescription') : t('shareRideDescription')}
        </Text>

          </ScrollView>
          <View className="border-t border-border bg-white px-4 sm:px-5 pb-4 pt-3">
          <Button
            title={rideType === 'private' ? t('continueWithPrivate') : t('continueWithShare')}
            icon="arrow-forward"
            iconPosition="right"
            onPress={findRide}
            disabled={!pickup || !destination || !canRequestRide}
          />
          {checking ? <Text className="font-sans mt-2 text-center text-xs text-text-secondary">{t('checkingActiveRide')}</Text> : null}
          </View>
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}

// A ride-type tile in the reference layout: a round icon chip over a title and
// a short label, the selected one ringed and tinted in Kimu green.
function RideOptionCard({
  selected,
  title,
  subtitle,
  icon,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={title}
      className="flex-1 flex-row items-center rounded-2xl px-3 py-3"
      style={{
        backgroundColor: selected ? '#E9F4EE' : '#FFFFFF',
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? '#0E7C4A' : '#E5E7EB',
      }}
      onPress={onPress}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: selected ? '#0E7C4A' : '#F1F3F5' }}
      >
        <Ionicons name={icon} size={21} color={selected ? '#FFFFFF' : '#6B7280'} />
      </View>
      <View className="ml-2.5 flex-1">
        <Text className={`text-[15px] font-bold ${selected ? 'text-primary' : 'text-ink'}`} numberOfLines={1}>{title}</Text>
        <Text className="font-sans text-[11px] text-text-secondary" numberOfLines={1}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}
