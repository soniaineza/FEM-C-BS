import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { KimuLayout } from '../../constants/theme';

type KeyboardFormScrollViewProps = {
  children: ReactNode;
  centered?: boolean;
  topPadding?: number;
  bottomPadding?: number;
  horizontalPadding?: number;
};

/** Consistent, scrollable form column for both roles and every screen width. */
export function KeyboardFormScrollView({
  children,
  centered = false,
  topPadding = 8,
  bottomPadding = KimuLayout.formBottomPadding,
  horizontalPadding = KimuLayout.formHorizontalPadding,
}: KeyboardFormScrollViewProps) {
  return (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: centered ? 'center' : undefined,
        paddingHorizontal: horizontalPadding,
        paddingTop: topPadding,
        paddingBottom: bottomPadding,
      }}
    >
      <View style={{ width: '100%', maxWidth: KimuLayout.formMaxWidth, alignSelf: 'center' }}>
        {children}
      </View>
    </KeyboardAwareScrollView>
  );
}
