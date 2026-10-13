// Scripts the app injects into the map WebView (used by LiveMap.tsx). Plain
// ES5 strings: they run in the WebView, possibly an old one, and never go
// through Babel. Keep them in step with mapBoot.ts, which does the same job
// from inside the bundle.

/**
 * Runs before the page's own scripts (injectedJavaScriptBeforeContentLoaded).
 * Installs the error reporter early enough to catch a bundle that cannot
 * even be parsed, which no code inside the bundle could ever report.
 */
export const MAP_BOOT_SCRIPT = `
(function () {
  var w = window;
  var s = w.__kimuMap = w.__kimuMap || {};
  if (s.report) return;
  function send(action, message) {
    try {
      var bridge = w.ReactNativeWebView;
      if (!bridge || typeof bridge.postMessage !== 'function') return;
      bridge.postMessage(JSON.stringify({
        type: '$$native_action',
        data: { uid: 'kimu-' + Math.random().toString(36).slice(2), actionId: action, args: [message] }
      }));
    } catch (e) {}
  }
  s.report = function (action, message) {
    if (action === 'onError') s.lastError = message;
    send(action, message);
  };
  w.addEventListener('error', function (e) {
    if (e && e.message) {
      var where = e.filename ? ' (' + String(e.filename).replace(/^.*\\//, '') + ':' + e.lineno + ')' : '';
      s.report('onError', e.message + where);
    } else if (e && e.target && e.target.tagName === 'SCRIPT') {
      s.report('onError', 'The map script failed to load: ' + String(e.target.src || '').replace(/^.*\\//, ''));
    }
  }, true);
  w.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    s.report('onStage', 'unhandled rejection: ' + (r && r.message ? r.message : String(r)));
  });
})();
`;

/**
 * Runs once the page has finished loading (injectedJavaScript). By then the
 * bundle has either run or failed, so this can say which, and why, instead
 * of leaving the app to guess from a timeout.
 */
export const MAP_LOADED_PROBE = `
(function () {
  var w = window;
  var s = w.__kimuMap || {};
  var bridge = w.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== 'function') return;
  function send(action, message) {
    try {
      bridge.postMessage(JSON.stringify({
        type: '$$native_action',
        data: { uid: 'kimu-' + Math.random().toString(36).slice(2), actionId: action, args: [message] }
      }));
    } catch (e) {}
  }
  if (s.booted) return;
  if (typeof w.$$EXPO_DOM_HOST_OS === 'undefined') {
    send('onError', 'The map page could not read its start-up props (ReactNativeWebView.injectedObjectJson is ' + typeof bridge.injectedObjectJson + ').');
    return;
  }
  if (!s.bundleStarted) {
    send('onError', 'The map script did not run' + (s.lastError ? ': ' + s.lastError : ' (no error was reported; the script may be missing from the app).'));
    return;
  }
  send('onStage', 'page loaded, map script started, waiting for the map');
})();
`;
