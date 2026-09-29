import { ReactNode } from 'react';
import { View } from 'react-native';

import { useTranslation } from '../../hooks/useTranslation';
import { goBack } from '../../utils/navigation';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** Show the back button. Pass a function to override navigation. */
  back?: boolean | (() => void);
  /** Trailing accessory on the nav row (e.g. an IconButton or text action). */
  right?: ReactNode;
  /** 'large' = iOS large title under the nav row; 'inline' = title beside back. */
  size?: 'large' | 'inline';
  light?: boolean;
  className?: string;
}

/**
 * Standard screen header: optional back + trailing action on a 44pt nav row,
 * then a large title and supporting subtitle. Every pushed or tab screen
 * uses this so titles land in the same place app-wide.
 */
export function ScreenHeader({ title, subtitle, back, right, size = 'large', light, className }: ScreenHeaderProps) {
  const { t } = useTranslation();
  const onBack = typeof back === 'function' ? back : () => goBack();
  const showNavRow = Boolean(back || right || size === 'inline');
  const tone = light ? 'inverse' : 'default';

  return (
    <View className={`pb-2 ${className ?? ''}`}>
      {showNavRow ? (
        <View className="min-h-[44px] flex-row items-center">
          {back ? (
            <IconButton icon="chevron-back" accessibilityLabel={t('back')} variant={light ? 'glass' : 'soft'} onPress={onBack} />
          ) : null}
          {size === 'inline' && title ? (
            <Text variant="headline" tone={tone} numberOfLines={1} className="flex-1" style={{ flex: 1, marginLeft: back ? 12 : 0 }}>
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right}
        </View>
      ) : null}
      {size === 'large' && title ? (
        <Text variant="title-1" tone={tone} accessibilityRole="header" style={{ marginTop: showNavRow ? 12 : 4 }}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="callout" tone={light ? 'inverse' : 'muted'} style={{ marginTop: 4, opacity: light ? 0.85 : 1 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
