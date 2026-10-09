import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import {
  submitDriverSupportRequest,
  getDriverSupportTickets,
  DRIVER_SUPPORT_CATEGORIES,
} from '../../../../services/driver-profile-service';
import { SupportTicket } from '@kimu/shared/types/support';
import { ApiError } from '../../../../services/driver-api-client';
import { getSupportContacts, openWhatsAppSupport, openEmailSupport, SupportContacts } from '@kimu/shared/utils/support';

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
  // Server-configured contacts; a button is shown only for a contact the
  // server actually provides.
  const [contacts, setContacts] = useState<SupportContacts | null>(null);

  useEffect(() => {
    getDriverSupportTickets().then(setTickets).catch(() => setError(t('requestFailed')));
    getSupportContacts().then(setContacts).catch(() => setContacts(null));
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
    <ScreenShell title={t('helpSupportTitle')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pt-2 pb-10">
        <Text className="font-sans mt-1 text-text-secondary">{t('helpIntro')}</Text>

        {contacts?.whatsappNumber ? (
          <View className="mt-4">
            <Button title={t('whatsappSupport')} icon="logo-whatsapp" onPress={() => openWhatsAppSupport(contacts.whatsappNumber!)} />
          </View>
        ) : null}
        {contacts?.email ? (
          <Pressable className="mt-3" onPress={() => openEmailSupport(contacts.email!)}>
            <Text className="font-sans text-primary">{t('contactSupport')}</Text>
          </Pressable>
        ) : null}

        {sent ? (
          <Text className="font-sans mt-6 text-primary">{t('messageSentConfirmation')}</Text>
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
              {error ? <Text className="font-sans text-sm text-error">{error}</Text> : null}
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
                <Text className="font-sans flex-1 text-ink">{ticket.subject}</Text>
                <Text className="font-sans text-xs text-text-secondary">{t(statusKey(ticket.status) as any)}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
