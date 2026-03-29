module.exports = {
  extends: ['expo', 'prettier'],
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'warn',
    'react-hooks/exhaustive-deps': 'error',
  },
  ignorePatterns: ['node_modules/', 'android/', 'ios/', 'build/', '.expo/'],
};
