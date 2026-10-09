import { ReactNode, memo } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { goBack } from '../utils/navigation';

const EMBLEM = require('../assets/brand/logo-mark.png');

interface KimuTopBarProps {
  /** Centred beside the emblem. Keep it short: it truncates, never wraps. */
  title: string;
  /** A second centred line, e.g. the driver's own code. */
  subtitle?: string | null;
  /** Shows the hamburger on the left and opens the side menu. */
  onMenu?: () => void;
  /** Shows a back chevron on the left. Without onBack it calls goBack(). */
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  menuLabel?: string;
  backLabel?: string;
}

/**
 * The green bar both apps wear.
 *
 * It owns the top safe-area inset itself and paints the status-bar strip
 * green, so the screen underneath must NOT also apply a 'top' edge — that
 * would pad the notch twice. Wrap screens in SafeAreaView with
 * edges={['left','right']} (plus 'bottom' only where nothing else handles it).
 *
 * The left control and the right slot are the same width, so the emblem and
 * title sit optically centred whichever combination a screen uses.
 */
export const KimuTopBar = memo(function KimuTopBar({
  title,
  subtitle,
  onMenu,
  back = false,
  onBack,
  right,
  menuLabel = 'Menu',
  backLabel = 'Back',
}: KimuTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="bg-primary px-3 pb-3" style={{ paddingTop: insets.top + 8 }}>
      <View className="h-11 flex-row items-center">
        <View className="h-11 w-11 items-center justify-center">
          {onMenu ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={menuLabel}
              onPress={onMenu}
              hitSlop={10}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-white/15"
            >
              <Ionicons name="menu" size={26} color="#FFFFFF" />
            </Pressable>
          ) : back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              onPress={() => (onBack ? onBack() : goBack())}
              hitSlop={10}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-white/15"
            >
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>

        {/* min-w-0 lets a long title truncate instead of shoving the emblem
            off-centre on a narrow phone. */}
        <View className="min-w-0 flex-1 flex-row items-center justify-center">
          <View className="h-7 w-7 items-center justify-center rounded-full bg-white">
            <Image source={EMBLEM} style={{ width: 22, height: 22 }} resizeMode="contain" accessibilityIgnoresInvertColors />
          </View>
          <Text className="ml-2 shrink text-[17px] text-white font-display" numberOfLines={1}>
            {title}
          </Text>
        </View>

        <View className="h-11 w-11 items-center justify-center">{right}</View>
      </View>

      {subtitle ? (
        <Text className="font-sans mt-0.5 text-center text-[12px] text-white/85" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
});

KimuTopBar.displayName = 'KimuTopBar';
