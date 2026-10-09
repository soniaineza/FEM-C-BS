import { View, Text, Pressable } from 'react-native';
import { memo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

// Direct port of lib/widgets/error_message.dart: a tinted banner (6%-opacity
// red fill, 30%-opacity red border) with an error icon, used for every
// inline form/request error across the app instead of bare red text.
export const ErrorMessage = memo(function ErrorMessage({
  message,
  retryLabel,
  onRetry,
  dark = false,
}: {
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  dark?: boolean;
}) {
  return (
    <View
      className={`w-full flex-row items-start rounded-xl border px-3.5 py-3 ${
        dark ? 'border-dark-border bg-dark-surface' : ''
      }`}
      style={
        dark
          ? undefined
          : { backgroundColor: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.3)' }
      }
    >
      <Ionicons name="alert-circle-outline" color="#DC2626" size={20} />
      <Text className={`font-sans ml-2.5 flex-1 text-[13.5px] leading-5 ${dark ? 'text-dark-text' : 'text-ink'}`}>{message}</Text>
      {retryLabel && onRetry ? (
        <Pressable onPress={onRetry}>
          <Text className="ml-2 font-semibold text-primary">{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

ErrorMessage.displayName = 'ErrorMessage';
