/**
 * Paint colours a driver may have registered, mapped to what the map draws.
 *
 * This lives apart from carModel.ts on purpose. Native screens need only this
 * table, while carModel.ts pulls in three.js and ~248 KB of base64 car models
 * that are used exclusively inside the map's WebView. Metro bundles whole
 * module graphs with no tree-shaking, so importing the table from carModel.ts
 * dragged all of that into the native bundle, where it was parsed at every
 * cold start and never used.
 */
export const CAR_COLOR_NAMES: Record<string, string> = {
  white: '#f8fafc', black: '#1f2937', silver: '#c0c4ca', grey: '#8b9098', gray: '#8b9098',
  red: '#c8102e', blue: '#1d4ed8', green: '#15803d', yellow: '#eab308', orange: '#ea580c',
  brown: '#78350f', beige: '#d6c7a1', gold: '#b8923a', maroon: '#7f1d1d', navy: '#1e3a8a',
};
