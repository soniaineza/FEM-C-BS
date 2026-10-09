import { useEffect, useState } from 'react';
import { View, Text, Pressable, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useAppLockStore, PIN_LENGTH } from '../../stores/useAppLockStore';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The filled/empty dots above the keypad. */
function Dots({ count, error }: { count: number; error: boolean }) {
  return (
    <View className="mt-6 flex-row justify-center">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <View
          key={i}
          className={`mx-2 h-3.5 w-3.5 rounded-full ${
            error ? 'bg-error' : i < count ? 'bg-primary' : 'bg-border'
          }`}
        />
      ))}
    </View>
  );
}

function PadKey({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="mb-3 h-[64px] w-[31%] items-center justify-center rounded-2xl border border-border bg-white active:bg-primary-soft"
    >
      <Text className="text-[24px] font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

/**
 * Covers the driver app until the PIN is entered.
 *
 * It renders over everything rather than redirecting, so no screen behind it
 * has to know about locking, and a lock that arrives mid-navigation cannot
 * leave the app on a half-shown screen.
 */
export function AppLockGate() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isHydrated = useAppLockStore((s) => s.isHydrated);
  const locked = useAppLockStore((s) => s.locked);
  const verify = useAppLockStore((s) => s.verify);
  const hydrate = useAppLockStore((s) => s.hydrate);
  const noteBackgrounded = useAppLockStore((s) => s.noteBackgrounded);
  const noteForegrounded = useAppLockStore((s) => s.noteForegrounded);

  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') noteForegrounded();
      else noteBackgrounded();
    });
    return () => sub.remove();
  }, [noteBackgrounded, noteForegrounded]);

  // Clear whatever was half-typed whenever the gate opens again.
  useEffect(() => {
    if (locked) {
      setEntry('');
      setError(false);
    }
  }, [locked]);

  async function press(digit: string) {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + digit;
    setEntry(next);
    setError(false);
    if (next.length === PIN_LENGTH) {
      const ok = await verify(next);
      if (!ok) {
        setError(true);
        setEntry('');
      }
    }
  }

  if (!isHydrated || !locked) return null;

  return (
    <View
      className="absolute inset-0 bg-white"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-1 justify-center px-8">
        <View className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
            <Ionicons name="lock-closed" size={30} color="#0E7C4A" />
          </View>
          <Text className="mt-4 text-xl text-ink font-display">{t('appLockEnterPin')}</Text>
          <Dots count={entry.length} error={error} />
          {error ? <Text className="font-sans mt-3 text-[13px] text-error">{t('appLockWrongPin')}</Text> : null}
        </View>

        <View className="mt-8 flex-row flex-wrap justify-between">
          {KEYS.map((digit) => (
            <PadKey key={digit} label={digit} onPress={() => press(digit)} />
          ))}
          <View className="mb-3 h-[64px] w-[31%]" />
          <PadKey label="0" onPress={() => press('0')} />
          <PadKey
            label="⌫"
            accessibilityLabel={t('back')}
            onPress={() => { setEntry((e) => e.slice(0, -1)); setError(false); }}
          />
        </View>
      </View>
    </View>
  );
}
