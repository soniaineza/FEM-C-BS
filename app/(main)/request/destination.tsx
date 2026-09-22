import { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { BackHeader } from '../../../components/BackHeader';
import { RideMap } from '../../../components/RideMap';
import { FEMMapCard } from '../../../components/FEMMapCard';
import { useTranslation } from '../../../hooks/useTranslation';
import { useDebouncedCallback } from '../../../hooks/useDebounce';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import * as locationService from '../../../services/location-service';
import { getRecentPlaces, recordRecentPlace, RecentPlace } from '../../../services/user-service';
import { Place } from '../../../types/place';

export default function DestinationScreen() {
  const { t } = useTranslation();
  const pickup = useRideWizardStore((s) => s.pickup);
  const setDestination = useRideWizardStore((s) => s.setDestination);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const [recentering, setRecentering] = useState(false);
  const [focusCenter, setFocusCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | undefined>();

  // Recenter on the rider's current location without selecting it. Never
  // freezes on GPS failure — surfaces an error and leaves manual search/pin
  // selection fully usable.
  async function handleRecenter() {
    setRecentering(true);
    setError(undefined);
    try {
      const place = await locationService.getCurrentPlace();
      setFocusCenter({ latitude: place.latitude!, longitude: place.longitude! });
      setRecenterToken((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : undefined);
    } finally {
      setRecentering(false);
    }
  }

  useEffect(() => {
    getRecentPlaces().then(setRecent);
  }, []);

  const runSearch = useDebouncedCallback(async (q: string) => {
    if (q.trim().length < 2) return setResults([]);
    setSearching(true);
    try {
      setResults(await locationService.searchLocations(q));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, 400);

  function onQueryChange(text: string) {
    setQuery(text);
    runSearch(text);
  }

  function choosePlace(place: Place) {
    // Matches home_screen.dart's _openDestination(): a sub-screen pushed
    // from home that returns a Place — home is the hub, so go back to it.
    setDestination(place);
    recordRecentPlace(place);
    router.back();
  }

  // Tapping the map picks that exact spot even when the rider doesn't know
  // its street name — same pattern as request/pickup.tsx.
  const [pinnedPlace, setPinnedPlace] = useState<Place | null>(null);
  const [resolvingTap, setResolvingTap] = useState(false);

  async function onMapPress(pos: { latitude: number; longitude: number }) {
    setResolvingTap(true);
    setPinnedPlace({ address: t('pinnedLocation'), ...pos });
    try {
      const resolved = await locationService.reverseGeocode(pos);
      setPinnedPlace(resolved);
    } catch {
      // Keep the generic "Pinned location" label — the coordinates still work.
    } finally {
      setResolvingTap(false);
    }
  }

  const mapCenter = pickup?.latitude && pickup?.longitude
    ? { latitude: pickup.latitude, longitude: pickup.longitude }
    : locationService.MapDefaults;

  const list = query.trim().length >= 2 ? results : recent.map((r) => ({ address: r.address, latitude: r.latitude, longitude: r.longitude }));

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <FEMMapCard
        height={200}
        className="mx-4 mt-3"
        onRecenter={handleRecenter}
        recenterDisabled={recentering}
        recenterLabel={t('useCurrentLocation')}
      >
        <RideMap
          center={pinnedPlace ? { latitude: pinnedPlace.latitude!, longitude: pinnedPlace.longitude! } : (focusCenter ?? mapCenter)}
          markers={pinnedPlace ? [{ id: 'pin', position: { latitude: pinnedPlace.latitude!, longitude: pinnedPlace.longitude! }, icon: 'destination' }] : []}
          onMapPress={onMapPress}
          recenterToken={recenterToken}
          retryLabel={t('tryAgain')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
        />
      </FEMMapCard>
      {error ? <Text className="px-6 pt-2 text-sm text-error">{error}</Text> : null}
      {pinnedPlace ? (
        <View className="border-b border-border bg-bg-light px-6 py-3">
          <Text numberOfLines={1} className="text-sm font-medium text-ink">
            {resolvingTap ? t('findingAddress') : pinnedPlace.address}
          </Text>
          <View className="mt-2">
            <Button title={t('confirmLocation')} onPress={() => choosePlace(pinnedPlace)} disabled={resolvingTap} />
          </View>
        </View>
      ) : null}
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-1 text-xl font-bold text-ink">{t('chooseDestination')}</Text>
        <Text className="mt-1 text-xs text-text-secondary">{t('tapMapHint')}</Text>

        <TextInput
          className="mt-4 h-button rounded border border-border bg-white px-4 text-base text-ink"
          placeholder={t('searchDestination')}
          placeholderTextColor="#6B7280"
          value={query}
          onChangeText={onQueryChange}
        />

        {searching ? <ActivityIndicator className="mt-4" color="#16A34A" /> : null}

        {query.trim().length < 2 && recent.length > 0 ? (
          <Text className="mt-4 text-sm font-medium text-text-secondary">{t('recentDestinations')}</Text>
        ) : null}

        <FlatList
          className="mt-2"
          data={list}
          keyExtractor={(item, idx) => `${item.address}-${idx}`}
          renderItem={({ item }) => (
            <Pressable className="border-b border-border py-3" onPress={() => choosePlace(item)}>
              <Text className="text-ink">{item.address}</Text>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaViewPlaceholder>
  );
}
