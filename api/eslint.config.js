import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    }
  },
  {
    rules: {
      // Leading underscore marks intentionally unused params (Express needs 4-arg error handlers).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }]
    }
  },
  {
    // supertest response bodies are untyped; assertions on them are the point of the tests.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  // Plain JS outside the TypeScript project: the config itself, and Vercel's one-line entry point.
  { files: ['eslint.config.js', 'index.js'], ...tseslint.configs.disableTypeChecked }
)
