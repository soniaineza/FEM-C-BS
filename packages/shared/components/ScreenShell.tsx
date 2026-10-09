import { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KimuTopBar } from './KimuTopBar';

/**
 * The standard frame for a screen: green Kimu bar on top, the screen's own
 * content below it.
 *
 * The bar paints the status-bar strip green and applies the top inset once,
 * so this wrapper deliberately takes only the side edges. Bottom padding is
 * left to the content, which usually scrolls; screens that pin something to
 * the bottom edge should add `insets.bottom` themselves.
 */
export function ScreenShell({
  title,
  subtitle,
  onMenu,
  back = false,
  onBack,
  right,
  menuLabel,
  backLabel,
  background = 'bg-white',
  children,
}: {
  title: string;
  subtitle?: string | null;
  onMenu?: () => void;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  menuLabel?: string;
  backLabel?: string;
  /** Tailwind class for the body behind the content, e.g. "bg-bg-light". */
  background?: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-primary" edges={['left', 'right']}>
      <KimuTopBar
        title={title}
        subtitle={subtitle}
        onMenu={onMenu}
        back={back}
        onBack={onBack}
        right={right}
        menuLabel={menuLabel}
        backLabel={backLabel}
      />
      <View className={`flex-1 ${background}`}>{children}</View>
    </SafeAreaView>
  );
}
