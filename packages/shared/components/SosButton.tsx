import { memo } from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';

/**
 * The filled red SOS control.
 *
 * It is its own component rather than `<Button className="bg-error" />`
 * because a utility class passed to Button only competes with Button's own
 * `bg-primary` on stylesheet order, not on the order of the class string —
 * which rendered the SOS button Kimu green.
 */
export const SosButton = memo(function SosButton({
  title,
  onPress,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <View
      style={{ shadowColor: '#DC2626', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        disabled={loading}
        onPress={onPress}
        className={`h-button w-full flex-row items-center justify-center rounded active:opacity-90 ${loading ? 'opacity-60' : ''}`}
        style={{ backgroundColor: '#DC2626' }}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-lg font-bold tracking-[2px] text-white">{title}</Text>
        )}
      </Pressable>
    </View>
  );
});

SosButton.displayName = 'SosButton';
