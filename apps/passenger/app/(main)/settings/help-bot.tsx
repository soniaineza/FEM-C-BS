import { router } from 'expo-router';

import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { HelpBot, HelpTopic } from '@kimu/shared/components/HelpBot';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';

// What riders actually ask, answered from the app's own dictionary so the
// screen works offline and can never state a fare or policy the app does not
// have. Anything it cannot answer hands off to real support.
const TOPICS: HelpTopic[] = [
  { id: 'book', question: 'helpQBook', answer: 'helpABook' },
  { id: 'pair', question: 'helpQPair', answer: 'helpAPair' },
  { id: 'pay', question: 'helpQPay', answer: 'helpAPay' },
  { id: 'fare', question: 'helpQFare', answer: 'helpAFare' },
  { id: 'cancel', question: 'helpQCancel', answer: 'helpACancel' },
  { id: 'emergency', question: 'helpQEmergency', answer: 'helpAEmergency' },
  { id: 'trusted', question: 'helpQTrusted', answer: 'helpATrusted' },
];

export default function RiderHelpBotScreen() {
  const { t } = useTranslation();

  return (
    <ScreenShell title={t('helpBotTitle')} back background="bg-white" backLabel={t('back')}>
      <HelpBot topics={TOPICS} onContactSupport={() => router.push('/(main)/settings/help-support')} />
    </ScreenShell>
  );
}
