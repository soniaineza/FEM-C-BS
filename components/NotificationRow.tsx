import { View } from 'react-native';
import { Pressable } from './ui/Pressable';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';
import { NotificationItem } from '../types/notification';
import { Text } from './ui/Text';

/** Inbox row: tinted icon, bold title while unread, body, unread dot. */
export function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !item.read }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        marginBottom: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: item.read ? Colors.border : Colors['primary-tint'],
        backgroundColor: pressed ? Colors.canvas : item.read ? Colors.surface : Colors['primary-soft'],
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: item.read ? Colors['surface-muted'] : Colors.surface,
        }}
      >
        <Ionicons name="notifications-outline" size={19} color={item.read ? Colors['fg-muted'] : Colors['primary-text']} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text variant="callout" weight={item.read ? 'medium' : 'semibold'}>
          {item.title}
        </Text>
        <Text variant="subhead" tone="muted" style={{ marginTop: 2 }}>
          {item.body}
        </Text>
      </View>
      {!item.read ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.primary, marginTop: 6, marginLeft: 8 }} /> : null}
    </Pressable>
  );
}
