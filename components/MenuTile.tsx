import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { ListItem } from './ui/List';

/**
 * Legacy row API kept for existing screens; renders a design-system
 * ListItem. Place inside a <ListSection> so rows share one grouped card.
 */
export const MenuTile = memo(function MenuTile({
  icon,
  label,
  onPress,
  destructive = false,
  trailing,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  trailing?: string;
  subtitle?: string;
}) {
  return <ListItem icon={icon} title={label} subtitle={subtitle} value={trailing} onPress={onPress} tone={destructive ? 'danger' : 'primary'} />;
});

MenuTile.displayName = 'MenuTile';
