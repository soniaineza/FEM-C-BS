// Platform-specific implementations: Metro resolves RideMap.web.tsx on web
// and RideMap.native.tsx on iOS/Android automatically. This file only
// exists so plain TypeScript tooling has a module to resolve against.
export * from './RideMap.web';
