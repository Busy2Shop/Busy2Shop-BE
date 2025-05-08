module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    env: {
        browser: false,
        node: true,
    },
    rules: {
        // 'prettier/prettier': 'error',
        indent: 'off', // Let Prettier handle indentation
        quotes: ['error', 'single'],
        semi: ['error', 'always'],
        'comma-dangle': ['error', 'always-multiline'],
        'no-var': 'error',
        'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
        'no-undef': 'error',
        'no-empty-function': 'error',
        'no-unescaped-entities': 'off',
    },
};
