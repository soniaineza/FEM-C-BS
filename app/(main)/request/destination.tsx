import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { useTranslation } from '../../../hooks/useTranslation';
import { useDebouncedCallback } from '../../../hooks/useDebounce';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import * as locationService from '../../../services/location-service';
import { getRecentPlaces, recordRecentPlace, RecentPlace } from '../../../services/user-service';
import { Place } from '../../../types/place';

export default function DestinationScreen() {
  const { t } = useTranslation();
  const setDestination = useRideWizardStore((s) => s.setDestination);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const [searching, setSearching] = useState(false);

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
    setDestination(place);
    recordRecentPlace(place);
    router.push('/(main)/request/ride-type');
  }

  const list = query.trim().length >= 2 ? results : recent.map((r) => ({ address: r.address, latitude: r.latitude, longitude: r.longitude }));

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-6">
        <Text className="text-xl font-bold text-ink">{t('chooseDestination')}</Text>

        <TextInput
          className="mt-4 h-button rounded border border-border bg-white px-4 text-base text-ink"
          placeholder={t('searchDestination')}
          placeholderTextColor="#6B7280"
          value={query}
          onChangeText={onQueryChange}
          autoFocus
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
    </SafeAreaView>
  );
}
