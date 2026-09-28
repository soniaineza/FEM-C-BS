import { router, type Href } from 'expo-router';

/**
 * Back when there is somewhere to go back to; otherwise (web refresh, deep
 * link, restored session) replace with `fallback`. A bare router.back() in
 * those cases dispatches a GO_BACK nobody handles and the tap does nothing.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
