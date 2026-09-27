import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeL2Norm,
  embeddingServingStatus,
  serialiseEmbedding,
} from '../workers/handlers/mediaEmbeddingUtils.js';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

  // Audit: placeholder (zero-vector) embeddings must NEVER enter the
  // serving view. The view filters status='ready' AND norm>0; this is the
  // write-side guard that keeps a zero-norm row out of 'ready' even if a
  // future real encoder forgets the placeholder flag.
  describe('embeddingServingStatus (placeholder isolation)', () => {
    it('marks a declared placeholder as placeholder even with a non-zero norm', () => {
      assert.equal(embeddingServingStatus(true, 1.5), 'placeholder');
    });

    it('marks a zero-norm vector as placeholder even when not flagged', () => {
      // A future encoder returning placeholder=false on a degenerate
      // vector must still not reach 'ready'.
      assert.equal(embeddingServingStatus(false, 0), 'placeholder');
      assert.equal(embeddingServingStatus(false, -0), 'placeholder');
    });

    it('rejects non-finite norms', () => {
      assert.equal(embeddingServingStatus(false, Number.NaN), 'placeholder');
      assert.equal(embeddingServingStatus(false, Number.POSITIVE_INFINITY), 'placeholder');
    });

    it('allows a real vector with a positive finite norm', () => {
      assert.equal(embeddingServingStatus(false, 0.5), 'ready');
    });
  });

  describe('handler write-path guard', () => {
    it('the handler derives status through embeddingServingStatus', () => {
      const src = readFileSync(
        path.join(SRC_DIR, 'workers', 'handlers', 'mediaEmbeddingHandler.ts'),
        'utf8',
      );
      // The stored status must come from the norm-checked helper — a raw
      // `placeholder ? 'placeholder' : 'ready'` ternary is the defect.
      assert.match(src, /embeddingServingStatus\(embeddingResult\.placeholder, norm\)/);
      assert.doesNotMatch(src, /placeholder \? 'placeholder' : 'ready'/);
    });

    it('the serving view and lineage query require ready + positive norm', () => {
      const migration181 = readFileSync(
        path.join(SRC_DIR, 'db', 'migrations', '181_media_embeddings_status.sql'),
        'utf8',
      );
      assert.match(migration181, /WHERE status = 'ready' AND norm > 0/);
      const embeddings = readFileSync(
        path.join(SRC_DIR, 'lib', 'mediaEmbeddings.ts'),
        'utf8',
      );
      assert.match(embeddings, /me\.status = 'ready' AND me\.norm > 0/);
    });
  });
});
