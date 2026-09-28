import { ReactNode, memo } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FEMMapCardProps {
  children: ReactNode;
  // Constrained, responsive height so the map reads as a card/section and
  // never swallows the screen. Full-screen map pages pass a larger value.
  height?: number;
  className?: string;
  // When provided, a floating recenter button is shown bottom-right. Kept
  // inside the card (which lives within the screen's SafeArea), so it never
  // overlaps system navigation.
  onRecenter?: () => void;
  recenterLabel?: string;
  recenterDisabled?: boolean;
}

// Reusable framed map container: rounded corners, clipping, subtle border +
// shadow, padding-free responsive width, and an optional recenter control.
// Wraps a RideMap child without owning any map logic itself.
export const FEMMapCard = memo(function FEMMapCard({
  children,
  height = 160,
  className,
  onRecenter,
  recenterLabel = 'Recenter map',
  recenterDisabled = false,
}: FEMMapCardProps) {
  return (
    <View
      className={`w-full overflow-hidden rounded-2xl border border-border bg-gray-light ${className ?? ''}`}
      style={{
        height,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      {children}

      {onRecenter ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recenterLabel}
          disabled={recenterDisabled}
          onPress={onRecenter}
          hitSlop={8}
          className="absolute bottom-3 right-3 h-11 w-11 items-center justify-center rounded-full bg-white"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
            opacity: recenterDisabled ? 0.5 : 1,
          }}
        >
          <Ionicons name="locate" size={22} color="#16A34A" />
        </Pressable>
      ) : null}
    </View>
  );
});

FEMMapCard.displayName = 'FEMMapCard';
