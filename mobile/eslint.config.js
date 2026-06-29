import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import oxlint from 'eslint-plugin-oxlint'

import noShadowedGlobalSelfCall from './eslint-rules/no-shadowed-global-self-call.js'

const localPlugin = {
  rules: {
    'no-shadowed-global-self-call': noShadowedGlobalSelfCall,
  },
}

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      local: localPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-unused-vars': 'off',

      // Safety rules to prevent undefined/null access errors
      'no-unsafe-optional-chaining': 'error',
      'array-callback-return': ['error', { allowImplicit: true }],
      'no-prototype-builtins': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      // `boolean: false` keeps the `!!x` idiom legal - the alternative
      // (`Boolean(x)`) is the exact pattern that caused the Boolean
      // self-shadowing bug. See eslint-rules/no-shadowed-global-self-call.js.
      'no-implicit-coercion': ['warn', { boolean: false }],

      // Forbid `<Name>(...)` inside an `export const <Name> = ...` when
      // <Name> shadows a JS global (Boolean, Number, ...). Prevents
      // accidental recursive self-invocation. See
      // eslint-rules/no-shadowed-global-self-call.js.
      'local/no-shadowed-global-self-call': 'error',
    },
  },
  {
    // Node-context tooling (build config + maintenance scripts): grant node
    // globals so process / __dirname resolve. Mirrors the .oxlintrc.json
    // override so both lint passes agree.
    files: ['vite.config.js', 'vitest.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Two-pass lint strategy: oxlint runs first (fast, native), eslint second
  // for the residual it cannot do (the custom local/ rule). This last block
  // reads .oxlintrc.json and turns OFF in eslint every rule oxlint already
  // owns, so no rule runs (or reports) twice. See ~/docs/LINTING.md.
  ...oxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
]
