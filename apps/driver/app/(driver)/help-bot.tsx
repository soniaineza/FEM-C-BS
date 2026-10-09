import { router } from 'expo-router';

import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { HelpBot, HelpTopic } from '@kimu/shared/components/HelpBot';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';

// The questions a driver asks in their first week, answered from the app's
// own dictionary — no network, no API key, and nothing it can get wrong about
// how the app behaves.
const TOPICS: HelpTopic[] = [
  { id: 'online', question: 'helpQGoOnline', answer: 'helpAGoOnline' },
  { id: 'accept', question: 'helpQAccept', answer: 'helpAAccept' },
  { id: 'start', question: 'helpQStartTrip', answer: 'helpAStartTrip' },
  { id: 'collect', question: 'helpQCollect', answer: 'helpACollect' },
  { id: 'payout', question: 'helpQPayout', answer: 'helpAPayout' },
  { id: 'norides', question: 'helpQNoRides', answer: 'helpANoRides' },
  { id: 'emergency', question: 'helpQDriverEmergency', answer: 'helpADriverEmergency' },
];

export default function DriverHelpBotScreen() {
  const { t } = useTranslation();

  return (
    <ScreenShell title={t('helpBotTitle')} back background="bg-white" backLabel={t('back')}>
      <HelpBot topics={TOPICS} onContactSupport={() => router.push('/(driver)/account/support' as any)} />
    </ScreenShell>
  );
}
