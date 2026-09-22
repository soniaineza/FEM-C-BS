import { View, Text, Pressable } from 'react-native';
import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface BackHeaderProps {
  title?: string;
  onBack?: () => void;
  // Set when the screen sits on a colored (e.g. primary green) background
  // instead of white, so the chevron and title stay legible.
  light?: boolean;
  className?: string;
}

// A consistent back affordance for every pushed screen — this app previously
// had no visual way back on web/Android beyond the OS/browser back gesture,
// since every Stack sets headerShown:false in favor of fully custom screen
// layouts (see app/_layout.tsx and friends). Used at the top of a screen's
// content instead of turning the native header back on, so it doesn't
// disturb screens with their own colored hero sections.
export const BackHeader = memo(function BackHeader({ title, onBack, light = false, className }: BackHeaderProps) {
  return (
    <View className={`flex-row items-center px-1 py-2 ${className ?? ''}`}>
      <Pressable
        className={`h-10 w-10 items-center justify-center rounded-full ${light ? 'bg-white/20' : 'bg-gray-light'}`}
        onPress={() => (onBack ? onBack() : router.back())}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={22} color={light ? '#fff' : '#111111'} />
      </Pressable>
      {title ? (
        <Text className={`ml-2 text-base font-bold ${light ? 'text-white' : 'text-ink'}`}>{title}</Text>
      ) : null}
    </View>
  );
});

BackHeader.displayName = 'BackHeader';
