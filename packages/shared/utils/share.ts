import { Platform, Share } from 'react-native';

import { appAlert } from '@kimu/shared/utils/dialog';

/** Share text through native share sheets or the browser's supported fallback. */
export async function shareText(title: string, message: string, copiedTitle: string, copiedBody: string) {
  if (Platform.OS !== 'web') {
    return Share.share({ title, message });
  }

  const webNavigator = globalThis.navigator as Navigator & {
    share?: (data: { title?: string; text?: string }) => Promise<void>;
  };
  if (webNavigator.share) {
    try {
      await webNavigator.share({ title, text: message });
      return;
    } catch (error) {
      // A dismissed native share sheet is not an error. If the API exists but
      // failed, fall through to the clipboard so the link remains usable.
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  try {
    await webNavigator.clipboard.writeText(message);
    appAlert(copiedTitle, copiedBody);
  } catch {
    // Older or non-secure browser contexts may not expose clipboard access.
    // Show the actual link in the app dialog so it can still be copied.
    appAlert(title, message);
  }
}
