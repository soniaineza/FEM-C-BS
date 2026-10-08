import { Text } from 'react-native';
import { memo } from 'react';

// Direct port of lib/widgets/section_title.dart.
export const SectionTitle = memo(function SectionTitle({ children }: { children: string }) {
  return <Text className="text-base font-bold text-ink">{children}</Text>;
});

SectionTitle.displayName = 'SectionTitle';
