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
 * Deserialise a little-endian float32 BYTEA payload back into a number[].
 * Inverse of {@link serialiseEmbedding}. Accepts a Buffer (what the pg
 * driver returns for BYTEA) or any Uint8Array view.
 *
 * Throws when the payload length is not a multiple of 4 bytes — a corrupt
 * blob must never be silently truncated into a wrong-length vector.
 */
export function deserialiseEmbedding(payload: Buffer | Uint8Array): number[] {
  if (payload.length % 4 !== 0) {
    throw new Error(
      `invalid embedding payload: ${payload.length} bytes is not a multiple of 4 (float32)`,
    );
  }
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const vector = new Array<number>(buffer.length / 4);
  for (let i = 0; i < vector.length; i++) {
    vector[i] = buffer.readFloatLE(i * 4);
  }
  return vector;
}

/**
 * Encode a vector as the pgvector text literal (`[v1,v2,...]`) accepted by
 * the `vector` type's input function / `::vector` cast. Only meaningful once
 * pgvector is installed (migration 326); the BYTEA codec above remains the
 * canonical serialisation.
 */
export function embeddingToVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Dot product over the shared prefix of two vectors. Callers are expected
 * to validate lengths against the row's `dimensions` column first — a
 * mismatched payload is skipped upstream, never silently zero-padded here.
 */
export function dotProduct(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
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
