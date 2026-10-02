import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { BackHeader } from '../../../../components/BackHeader';
import { useTranslation } from '../../../../hooks/useTranslation';
import { getDriverTicketWithMessages, replyToDriverTicket } from '../../../../services/driver-profile-service';
import { SupportTicket, SupportMessage } from '../../../../types/support';

const STATUS_KEYS: Record<string, string> = {
  open: 'ticketStatusOpen',
  in_progress: 'ticketStatusInProgress',
  resolved: 'ticketStatusResolved',
  closed: 'ticketStatusClosed',
};

export default function DriverTicketThreadScreen() {
  const { t } = useTranslation();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  function load() {
    if (!ticketId) { setLoading(false); setError(t('requestFailed')); return; }
    setLoading(true);
    setError(undefined);
    getDriverTicketWithMessages(ticketId)
      .then(({ ticket, messages }) => {
        setTicket(ticket);
        setMessages(messages);
      })
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(load, [ticketId]);

  async function handleReply() {
    if (!ticketId || !reply.trim()) return;
    setSending(true);
    try {
      await replyToDriverTicket(ticketId, reply.trim());
      setReply('');
      load();
    } catch {
      setError(t('messageSendFailed'));
    } finally {
      setSending(false);
    }
  }

  if (loading || !ticket) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-2">
          <BackHeader />
          {loading ? <ActivityIndicator className="mt-10" color="#0E7C4A" /> : (
            <View className="mt-10 gap-4">
              <Text className="text-center text-error">{error ?? t('requestFailed')}</Text>
              <Button title={t('tryAgain')} variant="outline" onPress={load} />
            </View>
          )}
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{ticket.subject}</Text>
        <Text className="mt-1 text-sm text-text-secondary">{t((STATUS_KEYS[ticket.status] ?? ticket.status) as any)}</Text>
        {error ? <Text className="mt-2 text-sm text-error">{error}</Text> : null}

        <FlatList
          className="mt-4"
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View className={`mt-2 max-w-[85%] rounded p-3 ${item.senderRole === 'driver' ? 'self-end bg-primary/10' : 'self-start bg-gray-light'}`}>
              <Text className="text-ink">{item.message}</Text>
            </View>
          )}
        />

        {ticket.status !== 'closed' && ticket.status !== 'resolved' ? (
          <View className="mt-4 flex-row items-end gap-3">
            <View className="flex-1">
              <Input value={reply} onChangeText={setReply} placeholder={t('messageLabel')} />
            </View>
            <View className="w-28">
              <Button title={t('sendMessage')} onPress={handleReply} loading={sending} />
            </View>
          </View>
        ) : null}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaViewPlaceholder>
  );
}
