import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'release/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    rules: {
      // TypeScript handles undefined identifiers; avoids needing exhaustive globals.
      'no-undef': 'off',
      // `any` is used deliberately in glue code (knex/electron/DI boundaries).
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow intentionally-unused args/vars prefixed with _ (e.g. ipc `_e`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ]
    }
  }
)
