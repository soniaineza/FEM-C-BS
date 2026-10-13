// The first thing the map page runs. MapEngine.tsx imports this module before
// MapLibre and three.js, so it is evaluated before either of them: any error
// while those are loaded, or later while the map is built, reaches the app
// as real text on the screen instead of a silent timeout.
//
// Two layers do this job, and whichever runs first wins:
//   - mapBootScripts.ts, injected by the native side before the page's own
//     scripts run (so even a SyntaxError in this bundle is reported);
//   - this module, inside the bundle, for WebViews where that injection
//     arrives late.
// Both talk to the app through expo/dom's native-action messages: the same
// envelope the DOM component's own `onError` / `onStage` callbacks use
// (node_modules/expo/src/dom/marshal.tsx), so no extra channel is needed.
import './webview-polyfills';

export type BootAction = 'onError' | 'onStage';

export interface MapBootState {
  /** This bundle was at least evaluated (set here). */
  bundleStarted?: boolean;
  /** MapEngine mounted and sent 'page booted'. */
  booted?: boolean;
  lastError?: string;
  report?: (action: BootAction, message: string) => void;
}

declare global {
  interface Window {
    __kimuMap?: MapBootState;
    ReactNativeWebView?: { postMessage(message: string): void; injectedObjectJson?: () => string };
  }
}

// node_modules/expo/src/dom/injection.ts
const NATIVE_ACTION = '$$native_action';

function state(): MapBootState | null {
  if (typeof window === 'undefined') return null;
  return (window.__kimuMap ??= {});
}

function post(action: BootAction, message: string) {
  const bridge = window.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== 'function') return; // plain web: nothing to tell
  bridge.postMessage(
    JSON.stringify({
      type: NATIVE_ACTION,
      data: { uid: 'kimu-' + Math.random().toString(36).slice(2), actionId: action, args: [message] },
    })
  );
}

/** Sends `message` to the app as if the DOM component had called its `action` prop. */
export function reportToNative(action: BootAction, message: string) {
  const s = state();
  if (!s) return;
  if (s.report) {
    s.report(action, message);
    return;
  }
  if (action === 'onError') s.lastError = message;
  post(action, message);
}

/** Called by MapEngine once it is mounted: the page is alive. */
export function markBooted() {
  const s = state();
  if (s) s.booted = true;
}

function describeError(event: ErrorEvent): string {
  const where = event.filename ? ' (' + event.filename.replace(/^.*\//, '') + ':' + event.lineno + ')' : '';
  return (event.message || 'Script error') + where;
}

(function install() {
  const s = state();
  if (!s) return;
  s.bundleStarted = true;
  if (s.report) return; // the pre-content hook from mapBootScripts.ts is in charge
  s.report = (action, message) => {
    if (action === 'onError') s.lastError = message;
    post(action, message);
  };
  window.addEventListener(
    'error',
    (event) => {
      if (event.message) {
        reportToNative('onError', describeError(event));
      } else if ((event.target as HTMLElement | null)?.tagName === 'SCRIPT') {
        const src = (event.target as HTMLScriptElement).src || '';
        reportToNative('onError', 'The map script failed to load: ' + src.replace(/^.*\//, ''));
      }
    },
    true
  );
  // Not fatal on their own (a car model that fails to decode, say), so these
  // only enrich the timeout message rather than failing the map.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    reportToNative('onStage', 'unhandled rejection: ' + (reason && reason.message ? reason.message : String(reason)));
  });
})();
