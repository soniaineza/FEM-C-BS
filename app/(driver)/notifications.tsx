import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';

import { Button } from '../../components/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { useResponsive } from '../../hooks/useResponsive';
import {
  getDriverNotifications,
  markDriverNotificationRead,
  markAllDriverNotificationsRead,
} from '../../services/driver-profile-service';
import { NotificationItem } from '../../types/notification';
import { Colors } from '../../constants/theme';
import { EmptyState, ErrorState, LoadingState, Banner, ScreenHeader } from '../../components/ui';
import { NotificationRow } from '../../components/NotificationRow';

export default function DriverNotificationsScreen() {
  const { t } = useTranslation();
  const { contentStyle } = useResponsive();
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
    <SafeAreaViewPlaceholder className="flex-1 bg-canvas">
      <View style={[{ flex: 1 }, contentStyle]} className="px-5 pt-2">
        <ScreenHeader
          back
          title={t('notifications')}
          right={items.some((i) => !i.read) ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={async () => {
                try {
                  await markAllDriverNotificationsRead();
                  setItems((prev) => prev.map((i) => ({ ...i, read: true })));
                } catch { setError(t('requestFailed')); }
              }}
            >
              <Text className="text-subhead font-semibold text-primary-text">{t('markAllRead')}</Text>
            </Pressable>
          ) : null}
        />

        {error && items.length > 0 ? <View className="mt-3"><Banner tone="danger" message={error} /></View> : null}

        {loading ? (
          <LoadingState />
        ) : error && items.length === 0 ? (
          <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
        ) : items.length === 0 ? (
          <EmptyState icon="notifications-outline" title={t('noNotificationsYet')} message={t('notificationsEmptySubtitle')} />
        ) : (
          <FlatList
            className="mt-4"
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => <NotificationRow item={item} onPress={() => handleOpen(item)} />}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}
