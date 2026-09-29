import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardFormScrollView } from '../../../components/layout/KeyboardFormScrollView';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { Linking } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { Chip } from '../../../components/ui/Chip';
import { useTranslation } from '../../../hooks/useTranslation';
import { submitRequest, getTickets } from '../../../services/support-service';
import { SUPPORT_CATEGORY_IDS, SupportTicket } from '../../../types/support';
import { ApiError } from '../../../services/api-client';
import { openWhatsAppSupport, SUPPORT_EMAIL } from '../../../utils/support';

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
    getTickets().then(setTickets).catch(() => setError(t('requestFailed')));
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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardFormScrollView bottomPadding={40}>
        <ScreenHeader back title={t('helpSupportTitle')} />
        <Text className="mt-1 text-fg-muted">{t('helpIntro')}</Text>

        <View className="mt-4">
          <Button title={t('whatsappSupport')} icon="logo-whatsapp" onPress={() => openWhatsAppSupport()} />
        </View>
        <Pressable className="mt-3" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
          <Text className="text-primary-text">{t('contactSupport')}</Text>
        </Pressable>

        {sent ? (
          <Text className="mt-6 text-primary-text">{t('messageSentConfirmation')}</Text>
        ) : (
          <View className="mt-6">
            <Text className="text-subhead font-medium text-fg">{t('tellUsWhatHappened')}</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {TOPICS.map((key) => (
                <Chip key={key} label={t(key)} selected={topic === key} onPress={() => setTopic(key)} />
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
              {error ? <Text className="text-subhead text-danger">{error}</Text> : null}
            </View>

            <View className="mt-4">
              <Button title={t('sendMessage')} onPress={handleSend} loading={loading} />
            </View>
          </View>
        )}


        {tickets.length > 0 ? (
          <>
            <Text className="mt-8 text-title-3 font-bold text-fg">{t('supportYourTickets')}</Text>
            {tickets.map((ticket) => (
              <Pressable
                key={ticket.id}
                className="mt-2 flex-row items-center justify-between border-b border-border py-3"
                onPress={() => router.push({ pathname: '/(main)/settings/support/[ticketId]', params: { ticketId: ticket.id } })}
              >
                <Text className="flex-1 text-fg">{ticket.subject}</Text>
                <Text className="text-caption text-fg-muted">{ticket.status}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        <Text className="mt-8 text-title-3 font-bold text-fg">{t('faqTitle')}</Text>
        {FAQ_KEYS.map(([q, a]) => (
          <View key={q} className="mt-3">
            <Text className="text-subhead font-semibold text-fg">{t(q)}</Text>
            <Text className="mt-1 text-subhead text-fg-muted">{t(a)}</Text>
          </View>
        ))}
      </KeyboardFormScrollView>
    </SafeAreaViewPlaceholder>
  );
}
