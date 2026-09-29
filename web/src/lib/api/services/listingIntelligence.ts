/**
 * Listing intelligence service — web port of the backend call inside the
 * mobile `services/aiListingApi.ts` (POST /listing-intelligence/run).
 *
 * Verified contract (backend/api/src/routes/listingIntelligence.ts):
 *
 *   POST /listing-intelligence/run        — auth required (401 otherwise)
 *     body:  { photos: [{ id, url, width?, height? }] (1..20),
 *              filename?, sellerNotes?, categoryHint?, listingId?,
 *              idempotencyKey? }
 *     reply: { ok: true, run: { id, listingId, candidates, version,
 *              createdAt } }
 *     candidate: { field, value, evidence: { source, detail }, abstained }
 *
 * Truth principles (same as mobile):
 *   - Candidates are advisory evidence, never facts. The caller applies
 *     them only into empty fields and the seller reviews every value.
 *   - `abstained: true` means "no evidence found" — it is not a failure
 *     and carries an empty value.
 *   - The endpoint is heuristic: evidence comes from the photo filename,
 *     seller notes and category hint — not image recognition. UI copy
 *     must not claim otherwise.
 *   - No confidence scores and no price candidate exist on this wire —
 *     neither may be fabricated.
 */

import { fetchJson } from '../http';

export type ListingIntelligenceEvidenceSource =
  | 'filename'
  | 'photo'
  | 'seller_notes'
  | 'category_hint';

/** One advisory field candidate, verbatim from the wire. */
export interface ListingIntelligenceCandidate {
  /** e.g. 'title' | 'brand' | 'size' | 'color' | 'condition' | 'category'. */
  field: string;
  /** The suggested value — '' when `abstained`. */
  value: string;
  evidence: {
    source: ListingIntelligenceEvidenceSource;
    /** Human-readable provenance, e.g. `Found "nike" in filename`. */
    detail: string;
  };
  abstained: boolean;
}

export interface ListingIntelligenceRun {
  /** Durable audit id (`lir_…`) — the run is persisted server-side. */
  id: string;
  listingId: string | null;
  candidates: ListingIntelligenceCandidate[];
  version: string;
  createdAt: string;
}

export interface ListingIntelligenceInput {
  /** Staged photo references — url should be the verified upload receipt
   *  (publicUrl) once the media pipeline has landed; a still-uploading
   *  local preview uri validates on the wire but carries no evidence. */
  photos: { id: string; url: string; width?: number; height?: number }[];
  /** The originating file name — the primary evidence source. */
  filename?: string;
  /** Free text the seller has already written (the description draft). */
  sellerNotes?: string;
  /** Display name of the picked category, when one exists. */
  categoryHint?: string;
  /** Bind the run to the listing under edit, when there is one. */
  listingId?: string;
  signal?: AbortSignal;
}

/**
 * Run one suggestion pass over the staged photos. Throws the backend's own
 * error text on failure — callers surface it verbatim (never paraphrased)
 * alongside the manual path.
 */
export async function runListingIntelligence(
  input: ListingIntelligenceInput,
): Promise<ListingIntelligenceRun> {
  if (!input.photos.length) {
    throw new Error('Add at least one photo to auto-fill details.');
  }
  const payload = await fetchJson<{
    ok: boolean;
    run?: ListingIntelligenceRun;
    error?: string;
  }>(
    '/listing-intelligence/run',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photos: input.photos.slice(0, 20),
        filename: input.filename,
        sellerNotes: input.sellerNotes,
        categoryHint: input.categoryHint,
        listingId: input.listingId,
      }),
    },
    { signal: input.signal },
  );
  if (!payload.ok || !payload.run) {
    throw new Error(payload.error ?? 'Could not read photo details.');
  }
  return payload.run;
}
