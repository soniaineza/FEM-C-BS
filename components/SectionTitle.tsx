import { Text } from 'react-native';

// Direct port of lib/widgets/section_title.dart.
export function SectionTitle({ children }: { children: string }) {
  return <Text className="text-base font-bold text-ink">{children}</Text>;
}
