import { View, Text } from 'react-native';
import { memo } from 'react';

// The Kimu Transport wordmark used on the language, login and signup
// screens: two-tone text with a short orange accent rule beneath it.
// `withIcon` is kept so existing callers compile; there is no icon badge.
export const BrandMark = memo(function BrandMark({ fontSize = 28 }: { fontSize?: number; withIcon?: boolean }) {
  return (
    <View className="items-center">
      <View className="flex-row items-center">
        <Text style={{ fontSize, letterSpacing: -0.5 }} className="font-bold text-ink">
          Kimu
        </Text>
        <View className="w-1.5" />
        <Text style={{ fontSize, letterSpacing: -0.5 }} className="font-bold text-primary">
          Transport
        </Text>
      </View>
      <View className="mt-2 h-[3px] w-9 rounded-full bg-accent" />
    </View>
  );
});

BrandMark.displayName = 'BrandMark';
