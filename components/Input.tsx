import { useState, memo, forwardRef } from 'react';
import { View, TextInput, TextInputProps, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Fonts, Type } from '../constants/theme';
import { Text } from './ui/Text';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Helper text under the field when there is no error. */
  hint?: string;
  // Ionicons name, e.g. 'person-outline', 'call-outline', 'mail-outline'.
  prefixIcon?: keyof typeof Ionicons.glyphMap;
  className?: string;
}

// Text field: label above, 52pt surface with a hairline border that turns
// brand green with a soft ring on focus and red on error; optional leading
// icon, automatic password reveal, and helper/error text below.
export const Input = memo(
  forwardRef<TextInput, InputProps>(function Input(
    { label, error, hint, prefixIcon, secureTextEntry, multiline, onFocus, onBlur, editable = true, style, className: _className, ...rest },
    ref
  ) {
    const [revealed, setRevealed] = useState(false);
    const [focused, setFocused] = useState(false);
    const isPasswordField = Boolean(secureTextEntry);
    const borderColor = error ? Colors.danger : focused ? Colors.primary : Colors.border;
    const ring = focused ? (error ? 'rgba(217,45,32,0.14)' : Colors['primary-tint']) : 'transparent';

    return (
      <View style={{ width: '100%' }}>
        {label ? (
          <Text variant="subhead" weight="medium" style={{ marginBottom: 6 }}>
            {label}
          </Text>
        ) : null}
        <View style={{ borderRadius: 16, borderWidth: 3, borderColor: ring, margin: -3 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: multiline ? 'flex-start' : 'center',
              minHeight: multiline ? 120 : 52,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor,
              backgroundColor: editable ? Colors.surface : Colors['surface-muted'],
              paddingHorizontal: 14,
            }}
          >
            {prefixIcon ? (
              <Ionicons
                name={prefixIcon}
                size={20}
                color={focused ? Colors.primary : Colors['fg-subtle']}
                style={{ marginRight: 10, marginTop: multiline ? 14 : 0 }}
              />
            ) : null}
            <TextInput
              ref={ref}
              style={[
                {
                  flex: 1,
                  ...Type.body,
                  lineHeight: multiline ? Type.body.lineHeight : undefined,
                  fontFamily: Fonts.regular,
                  color: Colors.fg,
                  paddingVertical: multiline ? 14 : 12,
                  minHeight: multiline ? 116 : 48,
                },
                // The field draws its own focus ring; drop the browser outline.
                Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                style,
              ]}
              placeholderTextColor={Colors['fg-subtle']}
              secureTextEntry={isPasswordField && !revealed}
              multiline={multiline}
              editable={editable}
              textAlignVertical={multiline ? 'top' : 'center'}
              // The visible label doubles as the field's accessible name.
              accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
              onFocus={(e) => {
                setFocused(true);
                onFocus?.(e);
              }}
              onBlur={(e) => {
                setFocused(false);
                onBlur?.(e);
              }}
              {...rest}
            />
            {isPasswordField ? (
              <Pressable
                onPress={() => setRevealed((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
                hitSlop={12}
                style={{ marginLeft: 8 }}
              >
                <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors['fg-muted']} />
              </Pressable>
            ) : null}
          </View>
        </View>
        {error ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
            <Ionicons name="alert-circle" size={14} color={Colors.danger} />
            <Text variant="footnote" tone="danger" style={{ flex: 1 }}>
              {error}
            </Text>
          </View>
        ) : hint ? (
          <Text variant="footnote" tone="subtle" style={{ marginTop: 6 }}>
            {hint}
          </Text>
        ) : null}
      </View>
    );
  })
);

Input.displayName = 'Input';
