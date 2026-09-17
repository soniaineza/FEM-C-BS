// Platform-specific implementations: Metro resolves `session.native.ts` on
// iOS/Android and `session.web.ts` on web automatically. This file only
// exists so plain TypeScript tooling (tsc, editors) has a module to resolve
// against — it is never the file actually bundled.
export * from './session.web';
