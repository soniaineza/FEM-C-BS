import { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { BackHeader } from '../../../../components/BackHeader';
import { useTranslation } from '../../../../hooks/useTranslation';
import {
  submitDriverSupportRequest,
  getDriverSupportTickets,
  DRIVER_SUPPORT_CATEGORIES,
} from '../../../../services/driver-profile-service';
import { SupportTicket } from '../../../../types/support';
import { ApiError } from '../../../../services/driver-api-client';
import { openWhatsAppSupport, SUPPORT_EMAIL } from '../../../../utils/support';

// Topic chips map 1:1 onto DRIVER_SUPPORT_CATEGORIES keys; labels come from
// the locale dictionary (supportCategory*) so they follow the app language.
const TOPICS = Object.keys(DRIVER_SUPPORT_CATEGORIES) as (keyof typeof DRIVER_SUPPORT_CATEGORIES)[];

const TOPIC_KEYS: Record<keyof typeof DRIVER_SUPPORT_CATEGORIES, Parameters<ReturnType<typeof useTranslation>['t']>[0]> = {
  general: 'supportCategoryGeneral',
  payment: 'supportCategoryPayment',
  reportPassenger: 'supportCategoryReportRider',
  appIssue: 'supportCategoryAppIssue',
  billing: 'supportCategoryBilling',
  vehicleIssue: 'supportCategoryVehicleIssue',
  lostItem: 'supportCategoryLostItem',
};

// Ticket statuses stored by the backend ('open' | 'resolved' | 'closed')
// rendered through the dictionary like everything else.
const STATUS_KEYS: Record<string, string> = {
  open: 'ticketStatusOpen',
  in_progress: 'ticketStatusInProgress',
  resolved: 'ticketStatusResolved',
  closed: 'ticketStatusClosed',
};

function statusKey(status: string): string {
  return STATUS_KEYS[status] ?? status;
}

export default function DriverSupportScreen() {
  const { t } = useTranslation();
  const [topic, setTopic] = useState<(typeof TOPICS)[number] | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    getDriverSupportTickets().then(setTickets);
  }, []);

  async function handleSend() {
    if (!topic) return setError(t('chooseTopicFirst'));
    if (!message.trim()) return setError(t('describeIssueHint'));
    setError(undefined);
    setLoading(true);
    try {
      const ticket = await submitDriverSupportRequest({
        category: topic,
        // Subject falls back to the localized topic label; the message body
        // is free text written in the user's own language.
        subject: subject.trim() || t(TOPIC_KEYS[topic]),
        message: message.trim(),
      });
      setSent(true);
      setTickets((prev) => [ticket, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('messageSendFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('helpSupportTitle')}</Text>
        <Text className="mt-1 text-text-secondary">{t('helpIntro')}</Text>

        <View className="mt-4">
          <Button title={t('whatsappSupport')} icon="logo-whatsapp" onPress={() => openWhatsAppSupport()} />
        </View>
        <Pressable className="mt-3" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
          <Text className="text-primary">{t('contactSupport')}</Text>
        </Pressable>

        {sent ? (
          <Text className="mt-6 text-primary">{t('messageSentConfirmation')}</Text>
        ) : (
          <View className="mt-6">
            <Text className="text-sm font-medium text-ink">{t('tellUsWhatHappened')}</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {TOPICS.map((key) => (
                <Pressable
                  key={key}
                  className={`rounded-full border px-3 py-1.5 ${topic === key ? 'border-primary bg-primary/10' : 'border-border'}`}
                  onPress={() => setTopic(key)}
                >
                  <Text className={topic === key ? 'text-primary' : 'text-ink'}>{t(TOPIC_KEYS[key])}</Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-4 gap-3">
              <Input label={t('subject')} value={subject} onChangeText={setSubject} />
              <Input label={t('describeIssueHint')} value={message} onChangeText={setMessage} multiline numberOfLines={4} />
              {error ? <Text className="text-sm text-error">{error}</Text> : null}
            </View>

            <View className="mt-4">
              <Button title={t('sendMessage')} onPress={handleSend} loading={loading} />
            </View>
          </View>
        )}

        {tickets.length > 0 ? (
          <>
            <Text className="mt-8 text-lg font-bold text-ink">{t('supportYourTickets')}</Text>
            {tickets.map((ticket) => (
              <Pressable
                key={ticket.id}
                className="mt-2 flex-row items-center justify-between border-b border-border py-3"
                onPress={() => router.push({ pathname: '/(driver)/account/support/[ticketId]', params: { ticketId: ticket.id } } as any)}
              >
                <Text className="flex-1 text-ink">{ticket.subject}</Text>
                <Text className="text-xs text-text-secondary">{t(statusKey(ticket.status) as any)}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
