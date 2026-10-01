// Bridge to the phone's own notification system. The backend core stays free of
// React Native imports; the app installs a real sink at startup
// (services/offline/device.ts) and tests use the silent default.

export interface AlertSink {
  /** Schedules an OS notification for an absolute time; resolves to its id (or null if not allowed). */
  schedule(fireAtMs: number, title: string, body: string): Promise<string | null>;
  cancel(ids: string[]): Promise<void>;
}

let sink: AlertSink = {
  schedule: async () => null,
  cancel: async () => {},
};

export function setAlertSink(next: AlertSink): void {
  sink = next;
}

export const alerts = {
  schedule: (fireAtMs: number, title: string, body: string) => sink.schedule(fireAtMs, title, body).catch(() => null),
  cancel: (ids: string[]) => (ids.length ? sink.cancel(ids).catch(() => {}) : Promise.resolve()),
};
