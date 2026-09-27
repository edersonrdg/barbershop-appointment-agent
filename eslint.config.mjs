// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const frameworkModules = [
  '@nestjs/*',
  'typeorm',
  'pg',
  'zod',
  '@google/genai',
  'nestjs-pino',
  'pino',
  'prom-client',
];

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist', 'coverage'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
      },
      'boundaries/elements': [
        { type: 'domain', pattern: 'src/domain/**', partialMatch: false },
        { type: 'usecases', pattern: 'src/usecases/**', partialMatch: false },
        {
          type: 'interface-adapters',
          pattern: 'src/interface-adapters/**',
          partialMatch: false,
        },
        {
          type: 'infrastructure',
          pattern: 'src/infrastructure/**',
          partialMatch: false,
        },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          checkAllOrigins: true,
          policies: [
            {
              from: { element: { type: 'domain' } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'usecases',
                        'interface-adapters',
                        'infrastructure',
                      ],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'usecases' } },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: ['interface-adapters', 'infrastructure'] },
                  },
                },
              },
            },
            {
              from: { element: { type: 'interface-adapters' } },
              disallow: {
                to: { element: { type: 'infrastructure' } },
              },
            },
            ...['domain', 'usecases'].map((type) => ({
              from: { element: { type } },
              disallow: {
                to: {
                  module: { origin: 'external', source: frameworkModules },
                },
              },
            })),
          ],
        },
      ],
    },
  },
);
