import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/__tests__/mediaContract.test.ts',
      'src/__tests__/safeRemoteMediaFetch.test.ts',
      'src/__tests__/vectorSearchIntegration.test.ts',
      'src/__tests__/visualSearchRoute.test.ts',
      'src/__tests__/compositionRenderer.test.ts',
      'src/__tests__/keyframeEvaluator.test.ts',
      'src/__tests__/creatorPublicationRender.test.ts',
      'src/__tests__/mediaPipeline.test.ts',
    ],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
  },
});
