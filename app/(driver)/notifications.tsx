import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';

import { BackHeader } from '../../components/BackHeader';
import { Button } from '../../components/Button';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getDriverNotifications,
  markDriverNotificationRead,
  markAllDriverNotificationsRead,
} from '../../services/driver-profile-service';
import { NotificationItem } from '../../types/notification';

export default function DriverNotificationsScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  function load() {
    setLoading(true);
    setError(undefined);
    getDriverNotifications()
      .then(setItems)
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleOpen(item: NotificationItem) {
    if (!item.read) {
      try {
        await markDriverNotificationRead(item.id);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      } catch { setError(t('requestFailed')); }
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xl text-ink font-display">{t('notifications')}</Text>
          {items.some((i) => !i.read) ? (
            <Pressable
              onPress={async () => {
                try {
                  await markAllDriverNotificationsRead();
                  setItems((prev) => prev.map((i) => ({ ...i, read: true })));
                } catch { setError(t('requestFailed')); }
              }}
            >
              <Text className="text-sm text-primary">{t('markAllRead')}</Text>
            </Pressable>
          ) : null}
        </View>

        {error && items.length > 0 ? <Text className="mt-3 text-sm text-error">{error}</Text> : null}

        {loading ? (
          <ActivityIndicator className="mt-8" color="#16A34A" />
        ) : error && items.length === 0 ? (
          <View className="mt-8 gap-4">
            <Text className="text-center text-error">{error}</Text>
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
          </View>
        ) : items.length === 0 ? (
          <View className="mt-8 items-center">
            <Text className="text-base font-medium text-ink">{t('noNotificationsYet')}</Text>
            <Text className="mt-1 text-center text-text-secondary">{t('notificationsEmptySubtitle')}</Text>
          </View>
        ) : (
          <FlatList
            className="mt-4"
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <Pressable className="border-b border-border py-3" onPress={() => handleOpen(item)}>
                <View className="flex-row items-center gap-2">
                  {!item.read ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
                  <Text className="text-base font-medium text-ink">{item.title}</Text>
                </View>
                <Text className="mt-1 text-sm text-text-secondary">{item.body}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}
