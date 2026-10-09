import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { Button } from '@kimu/shared/components/Button';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useAppLockStore, PIN_LENGTH } from '../../../stores/useAppLockStore';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

type Step = 'idle' | 'choose' | 'confirm' | 'remove';

// Turning the PIN on, changing it, and taking it off. The keypad is the same
// shape as the lock screen so the two read as one feature.
export default function DriverAppLockScreen() {
  const { t } = useTranslation();
  const enabled = useAppLockStore((s) => s.enabled);
  const setPin = useAppLockStore((s) => s.setPin);
  const clearPin = useAppLockStore((s) => s.clearPin);

  const [step, setStep] = useState<Step>('idle');
  const [first, setFirst] = useState('');
  const [entry, setEntry] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  function reset() {
    setStep('idle');
    setFirst('');
    setEntry('');
    setError(undefined);
  }

  async function complete(pin: string) {
    if (step === 'choose') {
      setFirst(pin);
      setEntry('');
      setStep('confirm');
      return;
    }
    if (step === 'confirm') {
      if (pin !== first) {
        setError(t('appLockMismatch'));
        setEntry('');
        setFirst('');
        setStep('choose');
        return;
      }
      await setPin(pin);
      setNotice(t('appLockSaved'));
      reset();
      return;
    }
    if (step === 'remove') {
      const ok = await clearPin(pin);
      if (!ok) {
        setError(t('appLockWrongPin'));
        setEntry('');
        return;
      }
      setNotice(t('appLockRemoved'));
      reset();
    }
  }

  function press(digit: string) {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + digit;
    setEntry(next);
    setError(undefined);
    setNotice(undefined);
    if (next.length === PIN_LENGTH) complete(next);
  }

  const prompt =
    step === 'choose' ? t('appLockSetPin') : step === 'confirm' ? t('appLockConfirmPin') : t('appLockEnterPin');

  return (
    <ScreenShell title={t('appLockTitle')} back background="bg-white" backLabel={t('back')}>
      <View className="flex-1 px-6 pt-4">
        {step === 'idle' ? (
          <>
            <View className="flex-row items-center rounded-2xl border border-border bg-white p-4">
              <View className={`h-11 w-11 items-center justify-center rounded-full ${enabled ? 'bg-primary-soft' : 'bg-gray-light'}`}>
                <Ionicons name={enabled ? 'lock-closed' : 'lock-open-outline'} size={22} color={enabled ? '#0E7C4A' : '#6B7280'} />
              </View>
              <Text className={`ml-3 flex-1 text-[15px] font-semibold ${enabled ? 'text-primary' : 'text-text-secondary'}`}>
                {enabled ? t('appLockOn') : t('appLockOff')}
              </Text>
            </View>

            <Text className="font-sans mt-3 text-[13px] leading-5 text-text-secondary">{t('appLockEnableHint')}</Text>

            {notice ? <Text className="mt-3 text-[13px] font-medium text-primary">{notice}</Text> : null}

            <View className="mt-6 gap-3">
              <Button
                title={enabled ? t('appLockChange') : t('appLockTitle')}
                icon="keypad-outline"
                onPress={() => { setStep('choose'); setEntry(''); setFirst(''); setNotice(undefined); }}
              />
              {enabled ? (
                <Button
                  title={t('appLockRemove')}
                  variant="outline"
                  destructive
                  onPress={() => { setStep('remove'); setEntry(''); setNotice(undefined); }}
                />
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Text className="text-center text-lg text-ink font-display">{prompt}</Text>

            <View className="mt-5 flex-row justify-center">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  className={`mx-2 h-3.5 w-3.5 rounded-full ${error ? 'bg-error' : i < entry.length ? 'bg-primary' : 'bg-border'}`}
                />
              ))}
            </View>

            {error ? <View className="mt-4"><ErrorMessage message={error} /></View> : null}

            <View className="mt-7 flex-row flex-wrap justify-between">
              {KEYS.map((digit) => (
                <Pressable
                  key={digit}
                  accessibilityRole="button"
                  accessibilityLabel={digit}
                  onPress={() => press(digit)}
                  className="mb-3 h-[64px] w-[31%] items-center justify-center rounded-2xl border border-border bg-white active:bg-primary-soft"
                >
                  <Text className="text-[24px] font-semibold text-ink">{digit}</Text>
                </Pressable>
              ))}
              <View className="mb-3 h-[64px] w-[31%]" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="0"
                onPress={() => press('0')}
                className="mb-3 h-[64px] w-[31%] items-center justify-center rounded-2xl border border-border bg-white active:bg-primary-soft"
              >
                <Text className="text-[24px] font-semibold text-ink">0</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('back')}
                onPress={() => { setEntry((e) => e.slice(0, -1)); setError(undefined); }}
                className="mb-3 h-[64px] w-[31%] items-center justify-center rounded-2xl border border-border bg-white active:bg-primary-soft"
              >
                <Text className="text-[24px] font-semibold text-ink">⌫</Text>
              </Pressable>
            </View>

            <Pressable accessibilityRole="button" className="items-center py-2" onPress={reset}>
              <Text className="text-sm font-semibold text-text-secondary">{t('cancel')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScreenShell>
  );
}
