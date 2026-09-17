import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { Linking } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { useTranslation } from '../../../hooks/useTranslation';
import { submitRequest, getTickets } from '../../../services/support-service';
import { SUPPORT_CATEGORY_IDS, SupportTicket } from '../../../types/support';
import { ApiError } from '../../../services/api-client';

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

  useEffect(() => {
    getTickets().then(setTickets);
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
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-6 pb-10">
        <Text className="text-xl font-bold text-ink">{t('helpSupportTitle')}</Text>
        <Text className="mt-1 text-text-secondary">{t('helpIntro')}</Text>

        <Pressable className="mt-3" onPress={() => Linking.openURL('mailto:support@femcabs.com')}>
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
              {error ? <Text className="text-sm text-error">{error}</Text> : null}
            </View>

            <View className="mt-4">
              <Button title={t('sendMessage')} onPress={handleSend} loading={loading} />
            </View>
          </View>
        )}

        {tickets.length > 0 ? (
          <>
            <Text className="mt-8 text-lg font-bold text-ink">{t('support')}</Text>
            {tickets.map((ticket) => (
              <Pressable
                key={ticket.id}
                className="mt-2 flex-row items-center justify-between border-b border-border py-3"
                onPress={() => router.push({ pathname: '/(main)/settings/support/[ticketId]', params: { ticketId: ticket.id } })}
              >
                <Text className="flex-1 text-ink">{ticket.subject}</Text>
                <Text className="text-xs text-text-secondary">{ticket.status}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        <Text className="mt-8 text-lg font-bold text-ink">{t('faqTitle')}</Text>
        {FAQ_KEYS.map(([q, a]) => (
          <View key={q} className="mt-3">
            <Text className="text-sm font-semibold text-ink">{t(q)}</Text>
            <Text className="mt-1 text-sm text-text-secondary">{t(a)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
