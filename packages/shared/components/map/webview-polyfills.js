// Polyfills for the map page in older Android System WebViews. Chromium 66
// (Android 9's factory WebView) is the floor, the same one Expo's Babel preset
// for DOM components targets. Plain ES5 and ASCII only: this runs before
// anything else, both in the page (first import of MapEngine.tsx, through
// mapBoot.ts) and inside MapLibre's web worker, where
// packages/shared/metro/mapLibreForWebView.js prepends this file's text to the
// worker's source. Nothing here may depend on `window`, and the file must not
// contain a double quote (it is embedded as a JSON string literal).
(function (g) {
  'use strict';
  if (typeof g.globalThis === 'undefined') g.globalThis = g;

  var AP = Array.prototype;
  var SP = String.prototype;

  function define(target, name, fn) {
    if (!target || typeof target[name] === 'function') return;
    Object.defineProperty(target, name, { value: fn, writable: true, configurable: true, enumerable: false });
  }

  // Chromium 93
  define(Object, 'hasOwn', function hasOwn(o, key) {
    return Object.prototype.hasOwnProperty.call(Object(o), key);
  });
  // Chromium 73
  define(Object, 'fromEntries', function fromEntries(entries) {
    var out = {};
    var list = Array.from(entries);
    for (var i = 0; i < list.length; i++) out[list[i][0]] = list[i][1];
    return out;
  });

  // Chromium 92
  function at(n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  }
  define(AP, 'at', at);
  define(SP, 'at', at);

  // Chromium 69
  define(AP, 'flat', function flat(depth) {
    depth = depth === undefined ? 1 : Math.floor(Number(depth));
    if (depth < 1) return AP.slice.call(this);
    return AP.reduce.call(
      this,
      function (acc, val) {
        if (Array.isArray(val)) acc.push.apply(acc, flat.call(val, depth - 1));
        else acc.push(val);
        return acc;
      },
      []
    );
  });
  define(AP, 'flatMap', function flatMap(fn, thisArg) {
    var out = [];
    for (var i = 0; i < this.length; i++) {
      var v = fn.call(thisArg, this[i], i, this);
      if (Array.isArray(v)) {
        for (var j = 0; j < v.length; j++) out.push(v[j]);
      } else {
        out.push(v);
      }
    }
    return out;
  });

  // Chromium 97
  define(AP, 'findLast', function findLast(fn, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return this[i];
    return undefined;
  });
  define(AP, 'findLastIndex', function findLastIndex(fn, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return i;
    return -1;
  });

  // Chromium 85
  define(SP, 'replaceAll', function replaceAll(search, replacement) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
      return this.replace(search, replacement);
    }
    var escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.replace(new RegExp(escaped, 'g'), replacement);
  });

  // Chromium 76
  if (typeof g.Promise === 'function') {
    define(g.Promise, 'allSettled', function allSettled(items) {
      return Promise.all(
        Array.from(items).map(function (p) {
          return Promise.resolve(p).then(
            function (value) { return { status: 'fulfilled', value: value }; },
            function (reason) { return { status: 'rejected', reason: reason }; }
          );
        })
      );
    });
  }

  // Chromium 71
  if (typeof g.queueMicrotask !== 'function') {
    g.queueMicrotask = function queueMicrotask(cb) { Promise.resolve().then(cb); };
  }

  // Chromium 66 (and throwIfAborted: Chromium 103). MapLibre creates one per
  // request. Without the real thing requests simply cannot be cancelled.
  if (typeof g.AbortController === 'undefined') {
    var Signal = function AbortSignal() {
      this.aborted = false;
      this.reason = undefined;
      this.onabort = null;
      this._listeners = [];
    };
    Signal.prototype.addEventListener = function (type, fn) { if (type === 'abort') this._listeners.push(fn); };
    Signal.prototype.removeEventListener = function (type, fn) {
      if (type === 'abort') this._listeners = this._listeners.filter(function (f) { return f !== fn; });
    };
    Signal.prototype.dispatchEvent = function () { return true; };
    var Controller = function AbortController() { this.signal = new Signal(); };
    Controller.prototype.abort = function (reason) {
      var s = this.signal;
      if (s.aborted) return;
      s.aborted = true;
      if (reason === undefined) {
        reason = new Error('The operation was aborted.');
        reason.name = 'AbortError';
      }
      s.reason = reason;
      var event = { type: 'abort', target: s };
      if (typeof s.onabort === 'function') s.onabort(event);
      s._listeners.slice().forEach(function (f) { f.call(s, event); });
    };
    g.AbortController = Controller;
    g.AbortSignal = Signal;
  }
  if (g.AbortSignal && g.AbortSignal.prototype) {
    define(g.AbortSignal.prototype, 'throwIfAborted', function throwIfAborted() {
      if (this.aborted) throw this.reason;
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : window);
