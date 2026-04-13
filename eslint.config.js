const config = require('@rubensworks/eslint-config');

module.exports = config([
  {
    ignores: [
      'node_modules',
      'coverage',
      '**/*.js',
      '**/*.d.ts',
      '**/*.js.map',
      '**/*.yml',
      '**/*.yaml',
      '**/*.md',
      'perf/**',
    ],
  },
  {
    files: [ '**/*.ts' ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: [ './tsconfig.eslint.json' ],
      },
    },
  },
  {
    // Project-specific overrides for TypeScript files
    files: [ '**/*.ts' ],
    rules: {
      // Project uses strictNullChecks: false, so this rule cannot be applied
      'ts/prefer-nullish-coalescing': 'off',
      // This is a Node.js library that legitimately imports Node.js built-in modules
      'import/no-nodejs-modules': 'off',
      // Allow UPPER_CASE for class properties (public API constants) and enum members
      'ts/naming-convention': [
        'error',
        {
          selector: 'default',
          format: [ 'camelCase' ],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'import',
          format: null,
        },
        {
          selector: 'variable',
          format: [ 'camelCase', 'UPPER_CASE' ],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'classProperty',
          format: [ 'camelCase', 'UPPER_CASE' ],
          leadingUnderscore: 'forbid',
          trailingUnderscore: 'forbid',
        },
        {
          selector: 'enumMember',
          format: [ 'camelCase', 'UPPER_CASE' ],
        },
        {
          selector: 'typeLike',
          format: [ 'PascalCase' ],
        },
        {
          selector: [ 'typeParameter' ],
          format: [ 'PascalCase' ],
          prefix: [ 'T' ],
        },
        {
          selector: 'interface',
          format: [ 'PascalCase' ],
          custom: {
            regex: '^I[A-Z]',
            match: true,
          },
        },
        {
          // Allow leading underscore for Node.js Transform stream override methods
          selector: 'method',
          format: [ 'camelCase' ],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'forbid',
        },
      ],
    },
  },
]);
