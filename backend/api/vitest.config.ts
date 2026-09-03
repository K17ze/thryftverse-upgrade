import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/__tests__/safeRemoteMediaFetch.test.ts',
      'src/__tests__/vectorSearchIntegration.test.ts',
      'src/__tests__/visualSearchRoute.test.ts',
    ],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
  },
});
