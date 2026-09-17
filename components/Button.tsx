import { Pressable, Text, ActivityIndicator, PressableProps } from 'react-native';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'text';
}

// Mirrors app_theme.dart's elevatedButtonTheme/outlinedButtonTheme: full
// width, 52px tall, 12px radius, filled brand green by default.
export function Button({ title, loading, variant = 'primary', disabled, className, ...rest }: ButtonProps & { className?: string }) {
  const isDisabled = disabled || loading;

  const base = 'h-button w-full items-center justify-center rounded';
  const styles =
    variant === 'primary'
      ? `${base} bg-primary ${isDisabled ? 'opacity-50' : ''}`
      : variant === 'outline'
        ? `${base} border border-primary ${isDisabled ? 'opacity-50' : ''}`
        : `${base} ${isDisabled ? 'opacity-50' : ''}`;

  const textStyles =
    variant === 'primary' ? 'text-white font-semibold text-base' : 'text-primary font-semibold text-base';

  return (
    <Pressable className={`${styles} ${className ?? ''}`} disabled={isDisabled} {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#16A34A'} />
      ) : (
        <Text className={textStyles}>{title}</Text>
      )}
    </Pressable>
  );
}
