import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { linterOptions: { reportUnusedDisableDirectives: false } },
  { ignores: ['node_modules/**', 'dist/**', 'android/**', 'ios/**', 'tests/e2e/report/**', 'tests/e2e/results/**', '.expo/**', '.agents/**', '.codex/**', 'docs/review-repro.cjs'] },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-debugger': 'error', 'no-unreachable': 'error', 'no-unsafe-finally': 'error',
      'no-dupe-args': 'error', 'no-dupe-keys': 'error', 'no-duplicate-case': 'error',
      'no-constant-binary-expression': 'error', 'valid-typeof': 'error',
    },
  },
  { files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}', 'stores/**/*.{ts,tsx}'], plugins: { 'react-hooks': reactHooks }, rules: { 'react-hooks/rules-of-hooks': 'error' } },
];
