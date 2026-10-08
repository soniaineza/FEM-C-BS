import { useRef, memo } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';

import { KimuColors } from '@kimu/shared/constants/theme';

const OTP_LENGTH = 6;

interface KimuOtpFieldProps {
  value: string;
  onChange: (code: string) => void;
  error?: boolean;
  disabled?: boolean;
}

export const KimuOtpField = memo(function KimuOtpField({ value, onChange, error, disabled }: KimuOtpFieldProps) {
  const hiddenRef = useRef<TextInput>(null);
  const digits = value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);

  return (
    <Pressable onPress={() => hiddenRef.current?.focus()} disabled={disabled}>
      <TextInput
        ref={hiddenRef}
        value={digits}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        caretHidden
        style={styles.hidden}
        editable={!disabled}
        autoFocus
      />
      <View style={styles.row}>
        {Array.from({ length: OTP_LENGTH }).map((_, i) => {
          const filled = Boolean(digits[i]);
          const active = digits.length === i;
          return (
            <View
              key={i}
              style={[
                styles.box,
                filled && styles.filled,
                active && styles.active,
                error && styles.error,
              ]}
            >
              <TextInput
                editable={false}
                value={digits[i] ?? ''}
                style={styles.digit}
                pointerEvents="none"
              />
            </View>
          );
        })}
      </View>
    </Pressable>
  );
});

KimuOtpField.displayName = 'KimuOtpField';

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  box: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 0.9,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: KimuColors.border,
    backgroundColor: KimuColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    borderColor: KimuColors.primary,
  },
  active: {
    borderColor: KimuColors.primary,
    backgroundColor: KimuColors.primarySoft,
  },
  error: {
    borderColor: KimuColors.error,
  },
  digit: {
    fontSize: 22,
    fontFamily: 'Inter_600SemiBold',
    color: KimuColors.ink,
    textAlign: 'center',
    padding: 0,
  },
});
