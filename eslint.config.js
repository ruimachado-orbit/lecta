// ESLint 9 flat config
import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import globals from 'globals'

// eslint-plugin-react-hooks is not a dependency yet, but the codebase already carries
// `eslint-disable-next-line react-hooks/exhaustive-deps` directives. Registering no-op
// rules under the same names keeps those directives resolvable instead of hard-erroring.
// Replace this stub with the real plugin once it is added to devDependencies.
const reactHooksStub = {
  rules: {
    'exhaustive-deps': { meta: { schema: [] }, create: () => ({}) },
    'rules-of-hooks': { meta: { schema: [] }, create: () => ({}) },
  },
}

export default [
  {
    ignores: [
      'out/**',
      'dist/**',
      'release/**',
      'node_modules/**',
      'web/**',
      'build/**',
      'packages/mcp-server/dist/**',
      'packages/mcp-server/node_modules/**',
      // Sample deck content shipped with the app — authored as deck data, not app source.
      'example-decks/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
    },
    plugins: { '@typescript-eslint': tseslint, react, 'react-hooks': reactHooksStub },
    settings: { react: { version: 'detect' } },
    rules: {
      ...tseslint.configs['eslint-recommended'].overrides[0].rules,
      ...tseslint.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      // Electron main legitimately uses `require()` for lazily-loaded native modules.
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react/prop-types': 'off',
      'react/no-unknown-property': 'off',
      'react/no-unescaped-entities': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-control-regex': 'off',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',
      'no-constant-binary-expression': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: { ...globals.vitest } },
  },
]
