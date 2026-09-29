import { View, Text, Pressable, StyleSheet } from 'react-native';
import { memo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { FemColors } from '../constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  wallet: { active: 'wallet', inactive: 'wallet-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
  activity: { active: 'time', inactive: 'time-outline' }, // passenger My Rides
  trips: { active: 'time', inactive: 'time-outline' }, // driver My Rides
  more: { active: 'grid', inactive: 'grid-outline' },
};

// The single bottom-navigation component for both the passenger and driver
// tab shells. Layout principles:
//  - Widths are always flex-1 (never fixed px), so 4 or 5 tabs and any screen
//    width from 320px up distribute evenly with no overflow.
//  - The device's bottom system inset (Android gesture bar / 3-button nav /
//    iOS home indicator) is painted BY this bar via paddingBottom, so the
//    white background runs flush to the screen edge while the icon row stays
//    clear of the system area. Never position or offset this bar manually.
//  - Touch targets stay >= 44pt (FemTouch.min) via minHeight.
export const FEMBottomNavigation = memo(function FEMBottomNavigation({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          // Gesture navigation (~16-24px) and 3-button nav (~48px) both land
          // inside insets.bottom; the floor of 10 keeps hairline+padding sane
          // on devices reporting a 0 inset.
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.row} pointerEvents="box-none">
        {state.routes.map((route: { key: string; name: string; params?: object }, index: number) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key] as {
            options: { tabBarLabel?: string; title?: string; tabBarAccessibilityLabel?: string };
          };
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name;
          const icons = ICONS[route.name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() => {
                navigation.emit({ type: 'tabLongPress', target: route.key });
              }}
              style={styles.item}
            >
              <View style={[styles.iconPill, focused && styles.iconPillActive]}>
                <Ionicons
                  name={focused ? icons.active : icons.inactive}
                  size={21}
                  color={focused ? FemColors.primary : FemColors.textSecondary}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: focused ? FemColors.primary : FemColors.textSecondary },
                  focused ? styles.labelActive : null,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

FEMBottomNavigation.displayName = 'FEMBottomNavigation';

const styles = StyleSheet.create({
  bar: {
    backgroundColor: FemColors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: FemColors.border,
    paddingTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  item: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  iconPill: {
    height: 30,
    minWidth: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: FemColors.primarySoft,
  },
  label: {
    fontSize: 10.5,
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
  },
  labelActive: {
    fontFamily: 'Inter_600SemiBold',
  },
});
