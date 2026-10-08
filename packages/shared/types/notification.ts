export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  createdAt: string;
  read: boolean;
}

export function notificationFromBackendJson(json: any): NotificationItem {
  return {
    id: json.id,
    title: json.title,
    body: json.body,
    type: json.type,
    createdAt: json.createdAt ?? json.created_at,
    read: Boolean(json.read),
  };
}
