import { useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { KimuLogo } from '@kimu/shared/components/KimuLogo';
import { LanguageSwitch } from '@kimu/shared/components/LanguageSwitch';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { SocialAuthButtons } from './SocialAuthButtons';

export type AuthTab = 'login' | 'register';

/**
 * The rider app's first screen on a white background: the logo and the
 * language toggle on top, the tagline, then a card with the Log in | Register
 * tabs and the matching form. One screen does what the old language chooser,
 * welcome, login and sign-up screens did between them.
 */
export function AuthLanding({ initialTab = 'login' }: { initialTab?: AuthTab }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<AuthTab>(initialTab);

  // Responsive sizing. The breakpoint used to be `height < 700`, which a very
  // common 412x732 phone misses by 32px — so it took the full-size layout and
  // overflowed by ~89px, meaning the screen had to be scrolled the moment it
  // opened. Measured on real sizes, not assumed: anything under a tall phone
  // now gets the tighter layout, and the tightest tier handles 640-tall.
  const tiny = height < 680 || width < 360;
  const compact = tiny || height < 800;
  const wide = width >= 600;
  const titleSize = tiny ? 20 : compact ? 24 : wide ? 34 : 29;
  const gap = tiny ? 6 : compact ? 12 : 24;

  return (
    <View className="flex-1 bg-white">
      <StatusBar style="dark" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow" bounces={false}>
        <View className="w-full max-w-[480px] flex-1 self-center" style={{ paddingTop: insets.top + (tiny ? 4 : compact ? 8 : 16) }}>
          <View className="px-6">
            <View className="flex-row items-center justify-between">
              <View className="mr-3 flex-1">
                <KimuLogo size={tiny ? 34 : compact ? 38 : wide ? 48 : 44} />
              </View>
              <LanguageSwitch />
            </View>

            <Text
              className="text-ink font-display"
              style={{ marginTop: gap, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2) }}
            >
              {t('heroTitle')}
            </Text>
            <Text
              className="font-semibold text-text-secondary"
              style={{ marginTop: tiny ? 4 : 8, fontSize: tiny ? 13 : 15 }}
            >
              {t('heroSubtitle')}
            </Text>
          </View>

          <View
            className="flex-1 rounded-t-[28px] bg-white px-6 pt-2"
            style={{
              marginTop: gap,
              paddingBottom: tiny ? 8 : compact ? 24 : 40,
              shadowColor: '#0E7C4A',
              shadowOpacity: 0.14,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: -4 },
              elevation: 8,
            }}
          >
            <View className="flex-row border-b border-border" accessibilityRole="tablist">
              {(['login', 'register'] as const).map((key) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setTab(key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    className="flex-1 items-center justify-center"
                    style={{ height: tiny ? 42 : compact ? 48 : 56 }}
                  >
                    <Text className={`${tiny ? 'text-[15px]' : 'text-[17px]'} ${active ? 'font-bold text-primary' : 'font-semibold text-text-secondary'}`}>
                      {key === 'login' ? t('login') : t('register')}
                    </Text>
                    <View className={`absolute bottom-0 left-0 right-0 h-[3px] rounded-full ${active ? 'bg-primary' : 'bg-transparent'}`} />
                  </Pressable>
                );
              })}
            </View>

            <View style={{ marginTop: tiny ? 12 : compact ? 16 : 24 }}>
              {tab === 'login' ? (
                <LoginForm onSwitchToRegister={() => setTab('register')} />
              ) : (
                <SignupForm onSwitchToLogin={() => setTab('login')} />
              )}
              <SocialAuthButtons />
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
