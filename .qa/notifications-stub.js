// QA-only stand-in for expo-notifications (unsupported in Expo Go on Android).
const denied = async () => ({ status: 'denied', granted: false });
module.exports = {
  getPermissionsAsync: denied,
  requestPermissionsAsync: denied,
  getExpoPushTokenAsync: async () => { throw new Error('unsupported in Expo Go'); },
  setNotificationHandler: () => {},
  scheduleNotificationAsync: async () => 'qa-stub',
  cancelScheduledNotificationAsync: async () => {},
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
};
