import { View, Text, TextInput, TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

// Mirrors app_theme.dart's inputDecorationTheme: filled white field,
// bordered, green focus ring, red error text.
export function Input({ label, error, className, ...rest }: InputProps & { className?: string }) {
  return (
    <View className="w-full">
      {label ? <Text className="mb-1.5 text-sm font-medium text-ink">{label}</Text> : null}
      <TextInput
        className={`h-button w-full rounded border px-4 text-base text-ink bg-white ${
          error ? 'border-error' : 'border-border'
        } ${className ?? ''}`}
        placeholderTextColor="#6B7280"
        {...rest}
      />
      {error ? <Text className="mt-1 text-xs text-error">{error}</Text> : null}
    </View>
  );
}
