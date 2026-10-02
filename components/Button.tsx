import { Pressable, Text, ActivityIndicator, View, PressableProps } from 'react-native';
import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'text';
  // Matches primary_button.dart's `destructive` flag: white bg, red border
  // and text, no shadow — used for "delete account" style actions.
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

// Mirrors primary_button.dart / app_theme.dart's elevatedButtonTheme: full
// width, 52px tall, 12px radius, filled brand green by default, with a soft
// brand-tinted shadow lifting it off the page.
export const Button = memo(function Button({
  title,
  loading,
  variant = 'primary',
  destructive = false,
  icon,
  disabled,
  className,
  ...rest
}: ButtonProps & { className?: string }) {
  const isDisabled = disabled || loading;
  const isPrimary = variant === 'primary' && !destructive;

  const base = 'h-button w-full flex-row items-center justify-center rounded';
  const styles = destructive
    ? `${base} border border-error bg-white ${isDisabled ? 'opacity-50' : ''}`
    : variant === 'primary'
      ? `${base} bg-primary ${isDisabled ? 'opacity-50' : ''}`
      : variant === 'outline'
        ? `${base} border border-primary ${isDisabled ? 'opacity-50' : ''}`
        : `${base} ${isDisabled ? 'opacity-50' : ''}`;

  const textColor = destructive ? 'text-error' : variant === 'primary' ? 'text-white' : 'text-primary';

  return (
    <View
      style={
        isPrimary && !isDisabled
          ? { shadowColor: '#0E7C4A', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }
          : undefined
      }
    >
      <Pressable accessibilityRole="button" accessibilityLabel={title} className={`${styles} ${className ?? ''}`} disabled={isDisabled} {...rest}>
        {loading ? (
          <ActivityIndicator color={destructive ? '#DC2626' : variant === 'primary' ? '#fff' : '#0E7C4A'} />
        ) : (
          <>
            {icon ? (
              <Ionicons
                name={icon}
                size={20}
                color={destructive ? '#DC2626' : variant === 'primary' ? '#fff' : '#0E7C4A'}
                style={{ marginRight: 8 }}
              />
            ) : null}
            <Text className={`font-semibold text-base ${textColor}`}>{title}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
});

Button.displayName = 'Button';
