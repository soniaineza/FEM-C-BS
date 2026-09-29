import { View } from 'react-native';

import { Colors } from '../../constants/theme';

export function Divider({ inset = 0, spacing = 0 }: { inset?: number; spacing?: number }) {
  return <View style={{ height: 1, backgroundColor: Colors.divider, marginLeft: inset, marginVertical: spacing }} />;
}
