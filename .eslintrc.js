module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: ['airbnb-base'],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // Allow console.log (will be replaced with Winston later)
    'no-console': 'off',

    // Allow single export default
    'import/prefer-default-export': 'off',

    // Allow requiring devDependencies in tests
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['**/__tests__/**', '**/*.test.js', '**/*.spec.js'],
      },
    ],

    // Allow longer lines for readability
    'max-len': ['error', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],

    // Allow ++ in for loops
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],

    // Allow param reassignment (common in Express middleware)
    'no-param-reassign': ['error', { props: false }],

    // Allow underscore dangle for private methods
    'no-underscore-dangle': 'off',

    // Consistent return not required (Express error handlers)
    'consistent-return': 'off',

    // Allow nested ternary (sometimes clearer)
    'no-nested-ternary': 'off',

    // Allow class methods without 'this' (factory methods)
    'class-methods-use-this': 'off',

    // Prefer const/let over var
    'no-var': 'error',
    'prefer-const': 'error',

    // Use strict equality
    eqeqeq: ['error', 'always'],

    // Require curly braces
    curly: ['error', 'all'],

    // Disallow unused variables (except those starting with _)
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};
