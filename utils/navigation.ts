import { router, type Href } from 'expo-router';

/**
 * Back when there is somewhere to go back to; otherwise (web refresh, deep
 * link, restored session) replace with `fallback`. A bare router.back() in
 * those cases dispatches a GO_BACK nobody handles and the tap does nothing.
 */
/**
 * Home, dropping every ride-flow screen stacked above it (the booking steps,
 * the ride screens). Leaving with replace() instead kept those screens under
 * Home, where Android back walked into them.
 */
export function goHome() {
  router.dismissTo('/(main)/(tabs)');
}

export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
