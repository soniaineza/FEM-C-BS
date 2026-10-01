import { Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../../components/Card';
import { Banner, ListItem, ListSection, Screen, ScreenHeader, Text } from '../../components/ui';
import { Colors } from '../../constants/theme';
import { useTranslation } from '../../hooks/useTranslation';

// Help / video-tutorials screen. Video content isn't hosted yet, so the
// screen lists the planned topics and points to support.
export default function DriverHelpVideosScreen() {
  const { t } = useTranslation();
  const topics = [
    { key: 'driverHelpTopic1', icon: 'person-add-outline' as const },
    { key: 'driverHelpTopic2', icon: 'navigate-outline' as const },
    { key: 'driverHelpTopic3', icon: 'qr-code-outline' as const },
    { key: 'driverHelpTopic4', icon: 'cash-outline' as const },
  ];

  return (
    <Screen header={<ScreenHeader back title={t('driverHelpVideosTitle')} />}>
      <View className="mt-2 flex-row flex-wrap gap-3">
        {topics.map((topic) => (
          <Card key={topic.key} className="items-center py-5" style={{ width: '48%' }}>
            <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: Colors['primary-soft'] }}>
              <Ionicons name={topic.icon} size={20} color={Colors['primary-text']} />
            </View>
            <Text variant="footnote" weight="semibold" align="center" style={{ marginTop: 10 }}>{t(topic.key as any)}</Text>
          </Card>
        ))}
      </View>

      <View className="mt-4">
        <Banner tone="info" message={t('driverHelpVideosHint')} />
      </View>

      <ListSection>
        <ListItem
          icon="chatbubble-ellipses-outline"
          title={t('driverHelpSupport')}
          onPress={() => Linking.openURL('mailto:support@femcabs.com')}
        />
      </ListSection>
    </Screen>
  );
}
