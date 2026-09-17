import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, Pressable, ActivityIndicator } from 'react-native';

import { useTranslation } from '../../../hooks/useTranslation';
import { getNotifications, markAsRead, markAllRead } from '../../../services/notification-service';
import { NotificationItem } from '../../../types/notification';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getNotifications()
      .then(setItems)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleOpen(item: NotificationItem) {
    if (!item.read) {
      await markAsRead(item.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-ink">{t('notifications')}</Text>
          {items.some((i) => !i.read) ? (
            <Pressable
              onPress={async () => {
                await markAllRead();
                setItems((prev) => prev.map((i) => ({ ...i, read: true })));
              }}
            >
              <Text className="text-sm text-primary">{t('markAllRead')}</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#16A34A" />
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
    </SafeAreaView>
  );
}
