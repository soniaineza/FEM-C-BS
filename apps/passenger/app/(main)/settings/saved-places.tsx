import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Modal, TextInput } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';

import { Button } from '@kimu/shared/components/Button';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getSavedPlaces, savePlace, deleteSavedPlace } from '../../../services/user-service';
import { searchLocations } from '@kimu/shared/services/location-service';
import { Place, placeHasCoordinates } from '@kimu/shared/types/place';
import { SavedPlace } from '../../../types/saved-place';

export default function SavedPlacesScreen() {
  const { t } = useTranslation();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedPlace || address.trim().length < 2 || !modalOpen) {
      setResults([]);
      setSearching(false);
      setHasSearched(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchLocations(address)
        .then((found) => { if (active) { setResults(found.filter(placeHasCoordinates)); setHasSearched(true); } })
        .catch(() => { if (active) setError(t('requestFailed')); })
        .finally(() => { if (active) setSearching(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [address, selectedPlace, modalOpen, t]);

  function load() {
    setLoading(true);
    setError(undefined);
    getSavedPlaces()
      .then(setPlaces)
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd() {
    if (!name.trim() || !selectedPlace || !placeHasCoordinates(selectedPlace)) {
      setError(t('savedPlaceSelectResult'));
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await savePlace({ type: 'other', name: name.trim(), place: selectedPlace });
      setName('');
      setAddress('');
      setSelectedPlace(null);
      setModalOpen(false);
      load();
    } catch {
      setError(t('requestFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSavedPlace(id);
      load();
    } catch {
      setError(t('requestFailed'));
    }
  }

  return (
    <ScreenShell title={t('savedPlaces')} back background="bg-white" backLabel={t('back')}>
      <View className="flex-1 px-6 pt-2">
        <View className="mt-2 flex-row items-center justify-between">
          <Pressable accessibilityRole="button" accessibilityLabel={t('addPlace')} onPress={() => setModalOpen(true)}>
            <Text className="font-semibold text-primary">{t('addPlace')}</Text>
          </Pressable>
        </View>

        {error && !modalOpen ? (
          <View className="mt-5">
            <Text className="font-sans text-sm text-error">{error}</Text>
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
          </View>
        ) : null}

        {!loading && !error && places.length === 0 ? (
          <View className="mt-8 items-center">
            <Text className="text-base font-medium text-ink">{t('noSavedPlaces')}</Text>
            <Text className="font-sans mt-1 text-center text-text-secondary">{t('savePlacesHint')}</Text>
          </View>
        ) : (
          <FlatList
            className="mt-4"
            data={places}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <View className="flex-row items-center justify-between border-b border-border py-3">
                <View className="flex-1">
                  <Text className="text-base font-medium text-ink">{item.name}</Text>
                  <Text className="font-sans text-sm text-text-secondary">{item.place.address}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('deleteTooltip')} ${item.name}`} onPress={() => handleDelete(item.id)}>
                  <Text className="font-sans text-error">{t('deleteTooltip')}</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-[480px] rounded-2xl bg-white p-6">
            <Text className="text-lg text-ink font-display">{t('addAPlace')}</Text>
            <TextInput
              className="mt-4 h-button rounded border border-border px-4 text-ink"
              placeholder={t('placeNameHint')}
              value={name}
              onChangeText={setName}
              accessibilityLabel={t('placeNameHint')}
            />
            <TextInput
              className="mt-3 h-button rounded border border-border px-4 text-ink"
              placeholder={t('addressHint')}
              value={address}
              onChangeText={(value) => { setAddress(value); setSelectedPlace(null); setResults([]); setHasSearched(false); setError(undefined); }}
              accessibilityLabel={t('addressHint')}
            />
            {searching ? <Text className="font-sans mt-2 text-sm text-text-secondary">{t('searching')}</Text> : null}
            {results.length > 0 ? (
              <View className="mt-2 max-h-48 rounded-xl border border-border">
                {results.slice(0, 5).map((place, index) => (
                  <Pressable
                    key={`${place.latitude}-${place.longitude}-${index}`}
                    accessibilityRole="button"
                    onPress={() => { setSelectedPlace(place); setAddress(place.address); setResults([]); setError(undefined); }}
                    className="border-b border-border px-3 py-3"
                  >
                    <Text numberOfLines={2} className="font-sans text-sm text-ink">{place.address}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {hasSearched && results.length === 0 && !selectedPlace && !searching ? (
              <Text className="font-sans mt-2 text-sm text-text-secondary">{t('noLocationsFound')}</Text>
            ) : null}
            {error ? <Text className="font-sans mt-2 text-sm text-error">{error}</Text> : null}
            <View className="mt-4 flex-row gap-3">
              <View className="flex-1">
                <Button title={t('back')} variant="outline" onPress={() => setModalOpen(false)} />
              </View>
              <View className="flex-1">
                <Button title={t('savePlace')} onPress={handleAdd} loading={saving} disabled={!name.trim() || !selectedPlace} />
              </View>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenShell>
  );
}
