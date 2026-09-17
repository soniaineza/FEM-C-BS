import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { useTranslation } from '../../../../hooks/useTranslation';
import { getTicketWithMessages, replyToTicket } from '../../../../services/support-service';
import { SupportTicket, SupportMessage } from '../../../../types/support';

export default function TicketThreadScreen() {
  const { t } = useTranslation();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    if (!ticketId) return;
    getTicketWithMessages(ticketId)
      .then(({ ticket, messages }) => {
        setTicket(ticket);
        setMessages(messages);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [ticketId]);

  async function handleReply() {
    if (!ticketId || !reply.trim()) return;
    setSending(true);
    try {
      await replyToTicket(ticketId, reply.trim());
      setReply('');
      load();
    } finally {
      setSending(false);
    }
  }

  if (loading || !ticket) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-6">
        <Text className="text-xl font-bold text-ink">{ticket.subject}</Text>
        <Text className="mt-1 text-sm text-text-secondary">{ticket.status}</Text>

        <FlatList
          className="mt-4"
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View className={`mt-2 max-w-[85%] rounded p-3 ${item.senderRole === 'passenger' ? 'self-end bg-primary/10' : 'self-start bg-gray-light'}`}>
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
    </SafeAreaView>
  );
}
