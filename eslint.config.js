import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Layer boundaries (docs/architecture.md): ui <- components <- panels, with
// domain and gateway free of Vue and stores the only owner of the gateway.
const restrict = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
})
const boundaries = [
  {
    files: ['src/domain/**'],
    rules: restrict(
      ['vue', '**/gateway/**', '**/stores/**', '**/ui/**', '**/components/**', '**/panels/**', '**/i18n/**'],
      'domain/ is plain TypeScript: no Vue, transport or UI',
    ),
  },
  {
    files: ['src/gateway/**'],
    rules: restrict(
      ['vue', '**/stores/**', '**/ui/**', '**/components/**', '**/panels/**', '**/i18n/**'],
      'gateway/ is transport only: no Vue, state or UI',
    ),
  },
  {
    files: ['src/ui/**'],
    rules: restrict(
      ['**/domain/**', '**/gateway/**', '**/stores/**', '**/components/**', '**/panels/**', '**/i18n/**'],
      'ui/ primitives take text and values through props',
    ),
  },
  {
    files: ['src/components/**'],
    rules: restrict(
      ['**/gateway/**', '**/stores/**', '**/panels/**'],
      'components/ take domain objects through props and emit intents; panels wire stores',
    ),
  },
  {
    files: ['src/stores/**'],
    rules: restrict(
      ['**/ui/**', '**/components/**', '**/panels/**'],
      'stores/ hold state and actions, no presentation',
    ),
  },
]

export default tseslint.config(
  { ignores: ['dist/', 'dist-hosted/', 'node_modules/', 'work/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', 'scripts/*.mjs', 'tests/unit/*.mjs', 'tests/e2e/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'vue/multi-word-component-names': 'off',
      // Interactive elements must stay text-safe: no v-html anywhere.
      'vue/no-v-html': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'tests/e2e/**/*.ts', 'tests/screenshots/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  ...boundaries,
  prettier,
)
