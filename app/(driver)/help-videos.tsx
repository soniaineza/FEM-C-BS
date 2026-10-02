import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { BackHeader } from '../../components/BackHeader';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../hooks/useTranslation';

// Help / video-tutorials screen — the reference's "Amashusho y'ubufasha".
// Video content isn't hosted yet, so the screen lists the planned topics and
// points to support; the currently-available topics open the support hub.
export default function DriverHelpVideosScreen() {
  const { t } = useTranslation();

  const topics = [
    { key: 'driverHelpTopic1', icon: 'person-add-outline' as const },
    { key: 'driverHelpTopic2', icon: 'navigate-outline' as const },
    { key: 'driverHelpTopic3', icon: 'qr-code-outline' as const },
    { key: 'driverHelpTopic4', icon: 'cash-outline' as const },
  ];

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
      <ScrollView contentContainerClassName="px-5 pb-10">
        <BackHeader title={t('driverHelpVideosTitle')} />

        <View className="flex-row items-center gap-3">
          {topics.map((topic) => (
            <View key={topic.key} className="flex-1 items-center rounded-2xl border border-dark-border bg-dark-surface py-5">
              <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(14,124,74,0.16)' }}>
                <Ionicons name={topic.icon} size={20} color="#0E7C4A" />
              </View>
              <Text className="mt-2.5 px-2 text-center text-[11px] font-semibold leading-3.5 text-dark-text">
                {t(topic.key as any)}
              </Text>
            </View>
          ))}
        </View>

        <View className="mt-6 flex-row items-start rounded-2xl border border-dark-border bg-dark-surface px-4 py-3.5">
          <Ionicons name="information-circle-outline" size={18} color="#5C6B8E" style={{ marginTop: 1 }} />
          <Text className="ml-2.5 flex-1 text-[12.5px] leading-5 text-dark-sub">{t('driverHelpVideosHint')}</Text>
        </View>

        <Pressable
          className="mt-4 flex-row items-center rounded-2xl border border-primary bg-dark-surface px-4 py-3.5"
          onPress={() => Linking.openURL('mailto:support@femcabs.com')}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#0E7C4A" />
          <Text className="ml-3 flex-1 text-[14.5px] font-semibold text-dark-text">{t('driverHelpSupport')}</Text>
          <Ionicons name="chevron-forward" size={18} color="#5C6B8E" />
        </Pressable>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}