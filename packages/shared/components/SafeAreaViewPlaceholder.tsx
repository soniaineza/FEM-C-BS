import { SafeAreaView } from 'react-native-safe-area-context';

// The app previously used SafeAreaView from 'react-native', which is a no-op
// on Android: content drew under the status bar and behind the gesture-nav
// bar (the reported "not responsive / overlapping system UI" on real
// devices). react-native-safe-area-context's SafeAreaView applies insets on
// both platforms and is already a project dependency, so this alias — plus
// the mechanical import/tag swap across all screens — is the whole fix.
//
// New screens should import SafeAreaView from 'react-native-safe-area-context'
// directly; this file exists so the bulk rename stayed a pure mechanical
// change.
export { SafeAreaView as SafeAreaViewPlaceholder } from 'react-native-safe-area-context';
