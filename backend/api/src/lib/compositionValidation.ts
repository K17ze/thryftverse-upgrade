import { z } from 'zod';

/**
 * Backend composition document validation.
 *
 * The full CreatorDocument schema lives on the frontend (Zod discriminated
 * union of 20 layer types). The backend does NOT need to re-validate every
 * layer payload — it stores the document as opaque JSONB for WYSIWYG
 * rendering. However, it MUST validate the envelope fields that carry
 * semantic meaning for the publication pipeline:
 *
 *  - `version`: the composition schema version. Rejecting unsupported
 *    versions prevents a client from persisting a document the viewer
 *    cannot render.
 *  - `type`: must match the publication surface (look vs poster). A
 *    mismatch indicates a client bug or a tampered payload.
 *  - `id`: must match the publication idempotency key. A mismatch
 *    indicates the client is trying to persist a document belonging to
 *    a different publication.
 *
 * This is a lightweight envelope check, not a full schema replay. The
 * 2026 best practice for versioned JSONB persistence is to validate the
 * version envelope server-side while keeping the body flexible for
 * forward-compatible rendering (the viewer can degrade gracefully on
 * unknown layer types).
 */

export const SUPPORTED_COMPOSITION_SCHEMA_VERSIONS = [1] as const;

export const CompositionDocumentEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['look', 'poster']),
  version: z.number().int().min(1),
});

export type CompositionDocumentEnvelope = z.infer<
  typeof CompositionDocumentEnvelopeSchema
>;

export interface CompositionValidationResult {
  ok: boolean;
  error?: string;
  code?: 'COMPOSITION_VERSION_UNSUPPORTED' | 'COMPOSITION_TYPE_MISMATCH'
    | 'COMPOSITION_ID_MISMATCH' | 'COMPOSITION_INVALID';
}

/**
 * Validate a composition document envelope against the expected
 * publication context. Returns `{ ok: true }` when the document is
 * structurally sound and matches the expected type and ID.
 */
export function validateCompositionDocument(
  doc: unknown,
  expected: { type: 'look' | 'poster'; id: string },
): CompositionValidationResult {
  if (doc === null || doc === undefined) {
    // Composition document is optional — absence is valid (legacy/simple
    // publications that don't need WYSIWYG rendering).
    return { ok: true };
  }

  const parsed = CompositionDocumentEnvelopeSchema.safeParse(doc);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Composition document envelope is invalid: ${parsed.error.message}`,
      code: 'COMPOSITION_INVALID',
    };
  }

  const envelope = parsed.data;

  if (!SUPPORTED_COMPOSITION_SCHEMA_VERSIONS.includes(
    envelope.version as (typeof SUPPORTED_COMPOSITION_SCHEMA_VERSIONS)[number],
  )) {
    return {
      ok: false,
      error: `Unsupported composition schema version ${envelope.version}. Supported: ${SUPPORTED_COMPOSITION_SCHEMA_VERSIONS.join(', ')}`,
      code: 'COMPOSITION_VERSION_UNSUPPORTED',
    };
  }

  if (envelope.type !== expected.type) {
    return {
      ok: false,
      error: `Composition document type '${envelope.type}' does not match publication type '${expected.type}'`,
      code: 'COMPOSITION_TYPE_MISMATCH',
    };
  }

  if (envelope.id !== expected.id) {
    return {
      ok: false,
      error: `Composition document id '${envelope.id}' does not match publication id '${expected.id}'`,
      code: 'COMPOSITION_ID_MISMATCH',
    };
  }

  return { ok: true };
}
