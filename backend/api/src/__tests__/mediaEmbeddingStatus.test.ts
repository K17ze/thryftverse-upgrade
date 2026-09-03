import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeL2Norm, serialiseEmbedding } from '../workers/handlers/mediaEmbeddingUtils.js';

describe('mediaEmbeddingUtils', () => {
  describe('computeL2Norm', () => {
    it('returns 0 for an empty vector', () => {
      assert.equal(computeL2Norm([]), 0);
    });

    it('returns 0 for a zero vector (placeholder)', () => {
      const zero = new Array(512).fill(0);
      assert.equal(computeL2Norm(zero), 0);
    });

    it('returns the Euclidean norm for a non-zero vector', () => {
      assert.ok(Math.abs(computeL2Norm([3, 4]) - 5) < 1e-10);
      assert.ok(Math.abs(computeL2Norm([1, 0, 0]) - 1) < 1e-10);
      assert.ok(Math.abs(computeL2Norm([1, 1, 1, 1]) - 2) < 1e-10);
    });

    it('handles negative values', () => {
      assert.ok(Math.abs(computeL2Norm([-3, -4]) - 5) < 1e-10);
    });
  });

  describe('serialiseEmbedding', () => {
    it('produces a buffer of length dimensions * 4', () => {
      const vector = [1, 2, 3, 4];
      const buffer = serialiseEmbedding(vector);
      assert.equal(buffer.length, 16);
    });

    it('round-trips float32 values via readFloatLE', () => {
      const vector = [1.5, -2.25, 0.125, 42.0];
      const buffer = serialiseEmbedding(vector);
      for (let i = 0; i < vector.length; i++) {
        assert.ok(Math.abs(buffer.readFloatLE(i * 4) - vector[i]) < 1e-5);
      }
    });

    it('produces an empty buffer for an empty vector', () => {
      assert.equal(serialiseEmbedding([]).length, 0);
    });
  });
});
