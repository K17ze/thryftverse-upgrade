/**
 * Pure helpers for media embedding serialisation and vector maths.
 *
 * Extracted from `mediaEmbeddingHandler.ts` so they can be unit-tested
 * without importing the handler (which pulls in `sharp` and the DB pool).
 *
 * @packageDocumentation
 */

/**
 * Serialise a float32 array into a little-endian BYTEA payload.
 * Each value is written as a 4-byte IEEE 754 float.
 */
export function serialiseEmbedding(vector: number[]): Buffer {
  const buffer = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }
  return buffer;
}

/**
 * Compute the L2 (Euclidean) norm of a vector.
 * Returns 0 for an empty vector. For a zero vector, returns 0.
 */
export function computeL2Norm(vector: number[]): number {
  if (vector.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i];
  }
  return Math.sqrt(sumSquares);
}
