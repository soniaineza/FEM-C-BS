import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Direct port of the repeated _MenuTile/_SettingsTile pattern in
// profile_screen.dart / settings_screen.dart: a white bordered row, icon +
// label + optional trailing content + chevron.
export function MenuTile({
  icon,
  label,
  onPress,
  destructive = false,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  trailing?: string;
}) {
  return (
    <Pressable
      className="mb-2 flex-row items-center rounded-xl border border-border bg-white px-3.5 py-3.5"
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={destructive ? '#DC2626' : '#6B7280'} />
      <Text className={`ml-3 flex-1 text-[14.5px] font-semibold ${destructive ? 'text-error' : 'text-ink'}`}>{label}</Text>
      {trailing ? <Text className="mr-1.5 text-[13.5px] text-text-secondary">{trailing}</Text> : null}
      <Ionicons name="chevron-forward" size={20} color="#6B7280" />
    </Pressable>
  );
}
