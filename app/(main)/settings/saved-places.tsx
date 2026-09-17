import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, Pressable, Modal, TextInput } from 'react-native';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { getSavedPlaces, savePlace, deleteSavedPlace } from '../../../services/user-service';
import { SavedPlace, SavedPlaceType } from '../../../types/saved-place';

export default function SavedPlacesScreen() {
  const { t } = useTranslation();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    getSavedPlaces()
      .then(setPlaces)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd() {
    if (!name.trim() || !address.trim()) return;
    setSaving(true);
    try {
      await savePlace({ type: 'other' as SavedPlaceType, name: name.trim(), place: { address: address.trim() } });
      setName('');
      setAddress('');
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteSavedPlace(id);
    load();
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-ink">{t('savedPlaces')}</Text>
          <Pressable onPress={() => setModalOpen(true)}>
            <Text className="font-semibold text-primary">{t('addPlace')}</Text>
          </Pressable>
        </View>

        {!loading && places.length === 0 ? (
          <View className="mt-8 items-center">
            <Text className="text-base font-medium text-ink">{t('noSavedPlaces')}</Text>
            <Text className="mt-1 text-center text-text-secondary">{t('savePlacesHint')}</Text>
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
                  <Text className="text-sm text-text-secondary">{item.place.address}</Text>
                </View>
                <Pressable onPress={() => handleDelete(item.id)}>
                  <Text className="text-error">{t('deleteTooltip')}</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded bg-white p-6">
            <Text className="text-lg font-bold text-ink">{t('addAPlace')}</Text>
            <TextInput
              className="mt-4 h-button rounded border border-border px-4 text-ink"
              placeholder={t('placeNameHint')}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              className="mt-3 h-button rounded border border-border px-4 text-ink"
              placeholder={t('addressHint')}
              value={address}
              onChangeText={setAddress}
            />
            <View className="mt-4 flex-row gap-3">
              <View className="flex-1">
                <Button title={t('back')} variant="outline" onPress={() => setModalOpen(false)} />
              </View>
              <View className="flex-1">
                <Button title={t('savePlace')} onPress={handleAdd} loading={saving} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
