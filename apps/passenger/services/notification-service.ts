import { apiClient } from './api-client';
import { NotificationItem, notificationFromBackendJson } from '@kimu/shared/types/notification';

export async function getNotifications(): Promise<NotificationItem[]> {
  const json = await apiClient.get<{ notifications: any[] }>('/notifications');
  return json.notifications.map(notificationFromBackendJson);
}

export async function markAsRead(id: string): Promise<void> {
  await apiClient.post(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await apiClient.post('/notifications/read-all');
}

export async function getUnreadCount(): Promise<number> {
  const json = await apiClient.get<{ count: number }>('/notifications/unread-count');
  return json.count;
}

// token is an Expo push token (ExponentPushToken[...]) from
// expo-notifications — the endpoint's storage side accepts any string
// shape; only the backend's *sending* side (server/src/services/notify.js)
// needs to know it's an Expo token, not a raw FCM one (Phase 5 backend
// touch).
export async function registerDeviceToken(token: string, platform?: string): Promise<void> {
  await apiClient.post('/notifications/device-token', { token, platform });
}
