import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { submitRequest, getTickets } from '../../../services/support-service';
import { SUPPORT_CATEGORY_IDS, SupportTicket } from '@kimu/shared/types/support';
import { ApiError } from '../../../services/api-client';
import { getSupportContacts, openWhatsAppSupport, openEmailSupport, SupportContacts } from '@kimu/shared/utils/support';

const TOPICS = Object.keys(SUPPORT_CATEGORY_IDS) as (keyof typeof SUPPORT_CATEGORY_IDS)[];

const FAQ_KEYS = [
  ['faqArrivalQuestion', 'faqArrivalAnswer'],
  ['faqFareQuestion', 'faqFareAnswer'],
  ['faqCancelQuestion', 'faqCancelAnswer'],
  ['faqLostItemQuestion', 'faqLostItemAnswer'],
] as const;

export default function HelpSupportScreen() {
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
    getTickets().then(setTickets).catch(() => setError(t('requestFailed')));
    getSupportContacts().then(setContacts).catch(() => setContacts(null));
  }, []);

  async function handleSend() {
    if (!topic) return setError(t('chooseTopicFirst'));
    if (!message.trim()) return setError(t('describeIssueHint'));
    setError(undefined);
    setLoading(true);
    try {
      const ticket = await submitRequest({ topicKey: topic, subject: subject.trim() || t(topic), message: message.trim() });
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
                  <Text className={topic === key ? 'text-primary' : 'text-ink'}>{t(key)}</Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-4 gap-3">
              <Input label={t('subject')} value={subject} onChangeText={setSubject} />
              <Input
                label={t('describeIssueHint')}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
              />
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
                onPress={() => router.push({ pathname: '/(main)/settings/support/[ticketId]', params: { ticketId: ticket.id } })}
              >
                <Text className="font-sans flex-1 text-ink">{ticket.subject}</Text>
                <Text className="font-sans text-xs text-text-secondary">{ticket.status}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        <Text className="mt-8 text-lg font-bold text-ink">{t('faqTitle')}</Text>
        {FAQ_KEYS.map(([q, a]) => (
          <View key={q} className="mt-3">
            <Text className="text-sm font-semibold text-ink">{t(q)}</Text>
            <Text className="font-sans mt-1 text-sm text-text-secondary">{t(a)}</Text>
          </View>
        ))}
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
