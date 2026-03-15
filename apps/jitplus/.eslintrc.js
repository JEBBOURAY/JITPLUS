module.exports = {
  extends: ['expo', 'prettier'],
  rules: {
    // Allow require() in config files
    '@typescript-eslint/no-var-requires': 'off',
    // Warn on unused vars (allow underscore prefix)
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Allow any in escape hatches
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['node_modules/', 'android/', 'ios/', 'build/', '.expo/'],
};
