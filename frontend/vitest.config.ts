import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': 'react-native-web',
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});