import { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '../hooks/useTranslation';
import type { TranslationKey } from '../locales';

export interface HelpTopic {
  id: string;
  question: TranslationKey;
  answer: TranslationKey;
}

interface Turn {
  id: string;
  question: string;
  answer: string;
}

function Bubble({ children }: { children: string }) {
  return (
    <View className="flex-row">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
        <Ionicons name="chatbubble-ellipses" size={18} color="#FFFFFF" />
      </View>
      <View className="ml-2.5 flex-1 rounded-2xl rounded-tl-sm bg-gray-light px-4 py-3">
        <Text className="font-sans text-[14.5px] leading-6 text-ink">{children}</Text>
      </View>
    </View>
  );
}

/**
 * The in-app help assistant.
 *
 * Answers are written strings in the app's own dictionary, not generated: it
 * works with no network and no API key, and it can never invent a fare, a
 * policy or a feature that does not exist.
 *
 * Everything lives in one scroll — intro, the conversation so far, then the
 * questions still unasked — so the screen reads as a single thread and is
 * full at rest instead of showing an empty panel above a pinned list. Each
 * answer scrolls the next suggestions into view.
 */
export function HelpBot({
  topics,
  onContactSupport,
}: {
  topics: HelpTopic[];
  onContactSupport?: () => void;
}) {
  const { t } = useTranslation();
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const asked = new Set(turns.map((turn) => turn.id));
  const remaining = topics.filter((topic) => !asked.has(topic.id));

  function ask(topic: HelpTopic) {
    setTurns((previous) => [
      ...previous,
      { id: topic.id, question: t(topic.question), answer: t(topic.answer) },
    ]);
    // Let the new bubbles lay out before scrolling to them.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerClassName="px-5 pb-8 pt-4"
      showsVerticalScrollIndicator={false}
    >
      <Bubble>{t('helpBotIntro')}</Bubble>

      {turns.map((turn, index) => (
        <View key={`${turn.id}-${index}`}>
          <View className="mt-4 items-end">
            <View className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5">
              <Text className="font-sans text-[14.5px] leading-6 text-white">{turn.question}</Text>
            </View>
          </View>
          <View className="mt-3">
            <Bubble>{turn.answer}</Bubble>
          </View>
        </View>
      ))}

      {remaining.length ? (
        <Text className="mb-2.5 mt-6 text-[12px] font-medium uppercase tracking-wide text-text-secondary">
          {turns.length ? t('helpBotMore') : t('helpBotTitle')}
        </Text>
      ) : null}

      {remaining.map((topic) => (
        <Pressable
          key={topic.id}
          accessibilityRole="button"
          onPress={() => ask(topic)}
          className="mb-2 min-h-[44px] flex-row items-center rounded-full border border-primary/40 bg-primary-soft px-4 py-2.5 active:bg-primary/10"
        >
          <Text className="flex-1 text-[14px] font-medium text-primary">{t(topic.question)}</Text>
          <Ionicons name="arrow-forward" size={16} color="#0E7C4A" />
        </Pressable>
      ))}

      {onContactSupport ? (
        <Pressable
          accessibilityRole="button"
          onPress={onContactSupport}
          className="mt-3 min-h-[44px] flex-row items-center justify-center rounded-full border border-border px-4 py-2.5 active:bg-gray-light"
        >
          <Ionicons name="headset-outline" size={16} color="#6B7280" />
          <Text className="ml-2 text-[14px] font-medium text-text-secondary">{t('helpBotContactSupport')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
