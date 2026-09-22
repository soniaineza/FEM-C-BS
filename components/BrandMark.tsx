import { View, Text } from 'react-native';
import { memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';

// Direct port of lib/widgets/brand_mark.dart — the FEM C@BS wordmark used on
// the splash and welcome screens, with an optional gradient icon badge above
// it (car icon in the Dart original; kept as a simple glyph here since we
// have no vector icon set installed).
export const BrandMark = memo(function BrandMark({ fontSize = 28, withIcon = true }: { fontSize?: number; withIcon?: boolean }) {
  return (
    <View className="items-center">
      {withIcon ? (
        <LinearGradient
          colors={['#16A34A', '#0F7A38']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 66,
            height: 66,
            borderRadius: 33,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
            shadowColor: '#16A34A',
            shadowOpacity: 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
          }}
        >
          <Text style={{ fontSize: 30, color: '#fff' }}>{'\u{1F697}'}</Text>
        </LinearGradient>
      ) : null}
      <View className="flex-row items-center">
        <Text style={{ fontSize, letterSpacing: -0.5 }} className="font-bold text-ink">
          FEM
        </Text>
        <View className="w-1.5" />
        <Text style={{ fontSize, letterSpacing: -0.5 }} className="font-bold text-primary">
          C@BS
        </Text>
      </View>
    </View>
  );
});

BrandMark.displayName = 'BrandMark';
