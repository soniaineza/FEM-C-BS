import { useState, memo } from 'react';
import { View, Text, TextInput, TextInputProps, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  // Ionicons name, matching custom_text_field.dart's prefixIcon (e.g.
  // 'person-outline', 'call-outline', 'mail-outline', 'lock-closed-outline').
  prefixIcon?: keyof typeof Ionicons.glyphMap;
}

// Mirrors app_theme.dart's inputDecorationTheme (filled white field,
// bordered, green focus ring, red error text) plus custom_text_field.dart's
// prefix icon and automatic password show/hide toggle for secureTextEntry
// fields.
export const Input = memo(function Input({
  label,
  error,
  prefixIcon,
  secureTextEntry,
  className,
  ...rest
}: InputProps & { className?: string }) {
  const [revealed, setRevealed] = useState(false);
  const isPasswordField = Boolean(secureTextEntry);

  return (
    <View className="w-full">
      {label ? <Text className="mb-1.5 text-sm font-medium text-ink">{label}</Text> : null}
      <View className="relative w-full justify-center">
        {prefixIcon ? (
          <View className="absolute left-3.5 z-10">
            <Ionicons name={prefixIcon} size={22} color="#6B7280" />
          </View>
        ) : null}
        <TextInput
          className={`h-button w-full rounded border bg-white text-base text-ink ${
            prefixIcon ? 'pl-11' : 'px-4'
          } ${isPasswordField ? 'pr-11' : prefixIcon ? 'pr-4' : ''} ${
            error ? 'border-error' : 'border-border'
          } ${className ?? ''}`}
          placeholderTextColor="#6B7280"
          secureTextEntry={isPasswordField && !revealed}
          // The visible label doubles as the field's accessible name, so
          // screen readers announce "Phone number, edit box" rather than
          // just "edit box".
          accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          {...rest}
        />
        {isPasswordField ? (
          <Pressable
            className="absolute right-3.5 z-10"
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={8}
          >
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B7280" />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="mt-1 text-xs text-error">{error}</Text> : null}
    </View>
  );
});

Input.displayName = 'Input';
