import { useState } from 'react';
import { View, Text, SafeAreaView, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { BackHeader } from '../../../components/BackHeader';
import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useDebouncedCallback } from '../../../hooks/useDebounce';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import * as locationService from '../../../services/location-service';
import { Place } from '../../../types/place';

export default function PickupScreen() {
  const { t } = useTranslation();
  const setPickup = useRideWizardStore((s) => s.setPickup);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [center, setCenter] = useState(locationService.MapDefaults);
  const [error, setError] = useState<string | undefined>();

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
    // Matches home_screen.dart's _openPickup(): pickup is a sub-screen
    // pushed from home that returns a Place, not a forward step in a
    // linear wizard — home is the hub, so we go back to it.
    setPickup(place);
    router.back();
  }

  async function useCurrentLocation() {
    setLocating(true);
    setError(undefined);
    try {
      const place = await locationService.getCurrentPlace();
      setCenter({ latitude: place.latitude!, longitude: place.longitude!, zoom: 16 });
      choosePlace(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : undefined);
    } finally {
      setLocating(false);
    }
  }

  // Tapping the map picks that exact spot even when the rider doesn't know
  // its street name — reverse-geocode it for a readable address, but the
  // pin's coordinates (not the guessed name) are what actually matters.
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

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="h-72 w-full">
        <RideMap
          center={center}
          zoom={center.zoom}
          markers={pinnedPlace ? [{ id: 'pin', position: { latitude: pinnedPlace.latitude!, longitude: pinnedPlace.longitude! }, icon: 'pickup' }] : [{ id: 'center', position: center, icon: 'me' }]}
          onMapPress={onMapPress}
        />
      </View>
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
        <Text className="mt-1 text-xl font-bold text-ink">{t('setPickup')}</Text>
        <Text className="mt-1 text-xs text-text-secondary">{t('tapMapHint')}</Text>

        <Pressable
          className="mt-4 h-button flex-row items-center rounded border border-primary px-4"
          onPress={useCurrentLocation}
          disabled={locating}
        >
          {locating ? <ActivityIndicator color="#16A34A" /> : <Text className="text-primary font-medium">{t('useCurrentLocation')}</Text>}
        </Pressable>
        {error ? <Text className="mt-2 text-sm text-error">{error}</Text> : null}

        <TextInput
          className="mt-4 h-button rounded border border-border bg-white px-4 text-base text-ink"
          placeholder={t('searchOrTypeAddress')}
          placeholderTextColor="#6B7280"
          value={query}
          onChangeText={onQueryChange}
        />

        {searching ? <ActivityIndicator className="mt-4" color="#16A34A" /> : null}

        <FlatList
          className="mt-2"
          data={results}
          keyExtractor={(item, idx) => `${item.address}-${idx}`}
          renderItem={({ item }) => (
            <Pressable className="border-b border-border py-3" onPress={() => choosePlace(item)}>
              <Text className="text-ink">{item.address}</Text>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}
