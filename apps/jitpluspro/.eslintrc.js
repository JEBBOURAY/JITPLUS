module.exports = {
  extends: ['expo', 'prettier'],
  rules: {
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'warn',
    'react-hooks/exhaustive-deps': 'error',
    // React Compiler rules enabled by eslint-config-expo 57 (eslint-plugin-react-hooks v7).
    // Kept as warnings until the existing code is migrated.
    'react-hooks/refs': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
    'react-hooks/purity': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/static-components': 'warn',
  },
  ignorePatterns: ['node_modules/', 'android/', 'ios/', 'build/', '.expo/'],
};
