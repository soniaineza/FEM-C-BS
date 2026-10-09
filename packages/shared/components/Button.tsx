import { Pressable, Text, ActivityIndicator, View, PressableProps } from 'react-native';
import { memo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'text';
  
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  // Where the icon sits relative to the title (default left).
  iconPosition?: 'left' | 'right';
}

export const Button = memo(function Button({
  title,
  loading,
  variant = 'primary',
  destructive = false,
  icon,
  iconPosition = 'left',
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
            {icon && iconPosition === 'left' ? (
              <Ionicons
                name={icon}
                size={20}
                color={destructive ? '#DC2626' : variant === 'primary' ? '#fff' : '#0E7C4A'}
                style={{ marginRight: 8 }}
              />
            ) : null}
            <Text className={`font-semibold text-base ${textColor}`}>{title}</Text>
            {icon && iconPosition === 'right' ? (
              <Ionicons
                name={icon}
                size={20}
                color={destructive ? '#DC2626' : variant === 'primary' ? '#fff' : '#0E7C4A'}
                style={{ marginLeft: 10 }}
              />
            ) : null}
          </>
        )}
      </Pressable>
    </View>
  );
});

Button.displayName = 'Button';
