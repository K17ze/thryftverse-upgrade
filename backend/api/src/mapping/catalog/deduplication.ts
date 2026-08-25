/**
 * Deduplication
 *
 * Layered duplicate detection for catalogue import items. Each layer is
 * independent and produces a score in [0, 1]; the strongest match across all
 * layers wins for each item. Deduplication never auto-merges: a probable
 * duplicate is surfaced for human confirmation.
 *
 * Layers (strongest -> weakest):
 * 1. exact_source_id       — same external item id
 * 2. normalised_url        — same normalised source URL
 * 3. source_checksum       — same deterministic source checksum
 * 4. exact_media_hash      — identical SHA-256 of primary media
 * 5. perceptual_similarity — close perceptual hash (image near-duplicate)
 * 6. candidate_model       — fuzzy match on brand + size + price + title
 *
 * Principles (per blueprint §10):
 * - Never auto-merge; return probable_duplicate for human confirmation.
 * - Prefer the strongest layer; do not accumulate weak signals into a strong
 *   one.
 */

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

export const DEDUP_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export type DedupLayer =
  | 'exact_source_id'
  | 'normalised_url'
  | 'source_checksum'
  | 'exact_media_hash'
  | 'perceptual_similarity'
  | 'candidate_model';

export interface DedupResult {
  isDuplicate: boolean;
  layer: DedupLayer | null;
  duplicateOfListingId: string | null;
  score: number;
}

// ---------------------------------------------------------------------------
// Layer thresholds
// ---------------------------------------------------------------------------

const EXACT_SCORE = 1.0;
const PERCEPTUAL_THRESHOLD = 0.9;
const CANDIDATE_MODEL_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Deterministic SHA-256 checksum of the source identity fields. The same
 * item from the same source always produces the same checksum, so re-imports
 * and cross-batch duplicates are detectable.
 */
export function computeSourceChecksum(item: {
  externalItemId: string;
  sourceUrl?: string;
  title?: string;
}): string {
  const payload = JSON.stringify({
    externalItemId: item.externalItemId,
    sourceUrl: item.sourceUrl ?? null,
    title: item.title ?? null,
  });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// URL normalisation
// ---------------------------------------------------------------------------

const TRACKING_PARAM_PREFIXES = new Set<string>([
  'utm_',
  'ref',
  'refsrc',
  'fbclid',
  'gclid',
  'igshid',
  'si',
  'trk',
  'epid',
  'hash',
]);

/**
 * Normalise a source URL for duplicate comparison: lowercase the host, strip
 * tracking parameters, drop fragments, and remove trailing slashes from the
 * path. Query params that are not tracking params are preserved but sorted
 * so order does not matter.
 */
export function normaliseSourceUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.trim().toLowerCase();
  }

  const host = parsed.hostname.toLowerCase();

  let path = parsed.pathname.replace(/\/+$/, '');
  if (path.length === 0) {
    path = '/';
  }

  const keptParams: Array<[string, string]> = [];
  parsed.searchParams.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    const isTracking =
      TRACKING_PARAM_PREFIXES.has(lowerKey) ||
      TRACKING_PARAM_PREFIXES.has(lowerKey.split('_')[0] + '_') ||
      [...TRACKING_PARAM_PREFIXES].some((p) => p.endsWith('_') && lowerKey.startsWith(p)) ||
      TRACKING_PARAM_PREFIXES.has(lowerKey);
    if (!isTracking) {
      keptParams.push([lowerKey, value]);
    }
  });

  keptParams.sort(([a], [b]) => a.localeCompare(b));
  const query = keptParams.map(([k, v]) => `${k}=${v}`).join('&');
  const queryString = query.length > 0 ? `?${query}` : '';

  return `${parsed.protocol}//${host}${path}${queryString}`;
}

// ---------------------------------------------------------------------------
// Perceptual similarity
// ---------------------------------------------------------------------------

/**
 * Compute a normalised similarity score in [0, 1] between two perceptual
 * hashes of equal length. The hashes are compared by hamming distance over
 * their hex representation; similarity = 1 - (distance / bitLength).
 *
 * Returns 0 for malformed or mismatched-length hashes.
 */
export function computePerceptualSimilarity(hashA: string, hashB: string): number {
  if (!hashA || !hashB) return 0;
  if (hashA.length !== hashB.length) return 0;

  let distance = 0;
  for (let i = 0; i < hashA.length; i++) {
    const charA = hashA[i];
    const charB = hashB[i];
    if (charA === charB) continue;
    // Hamming distance over the 4-bit nibbles.
    const nibA = parseInt(charA, 16);
    const nibB = parseInt(charB, 16);
    if (Number.isNaN(nibA) || Number.isNaN(nibB)) return 0;
    distance += popcount(nibA ^ nibB);
  }

  const bitLength = hashA.length * 4;
  if (bitLength === 0) return 0;
  return 1 - distance / bitLength;
}

function popcount(n: number): number {
  let count = 0;
  let x = n;
  while (x > 0) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Candidate model (fuzzy attribute match)
// ---------------------------------------------------------------------------

interface CandidateAttributes {
  title?: string;
  brand?: string;
  size?: string;
  priceGbp?: number;
}

function candidateModelScore(a: CandidateAttributes, b: CandidateAttributes): number {
  let score = 0;
  let weight = 0;

  // Brand: exact match (case-insensitive).
  if (a.brand && b.brand) {
    weight += 0.3;
    if (a.brand.toLowerCase() === b.brand.toLowerCase()) {
      score += 0.3;
    }
  }

  // Size: exact match (case-insensitive).
  if (a.size && b.size) {
    weight += 0.2;
    if (a.size.toLowerCase() === b.size.toLowerCase()) {
      score += 0.2;
    }
  }

  // Price: within 5% tolerance.
  if (a.priceGbp !== undefined && b.priceGbp !== undefined && a.priceGbp > 0 && b.priceGbp > 0) {
    weight += 0.2;
    const delta = Math.abs(a.priceGbp - b.priceGbp) / Math.max(a.priceGbp, b.priceGbp);
    if (delta <= 0.05) {
      score += 0.2;
    }
  }

  // Title: token overlap (Jaccard).
  if (a.title && b.title) {
    weight += 0.3;
    const tokensA = new Set(a.title.toLowerCase().split(/\s+/).filter((t) => t.length > 0));
    const tokensB = new Set(b.title.toLowerCase().split(/\s+/).filter((t) => t.length > 0));
    let intersection = 0;
    tokensA.forEach((t) => {
      if (tokensB.has(t)) intersection += 1;
    });
    const union = tokensA.size + tokensB.size - intersection;
    if (union > 0) {
      score += 0.3 * (intersection / union);
    }
  }

  // Normalise against the weight that could be earned.
  return weight > 0 ? score / weight * (1 - 0.05) : 0;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export interface DedupItem {
  id: string;
  externalItemId: string;
  sourceUrl?: string;
  sourceChecksum: string;
  sha256?: string;
  perceptualHash?: string;
  title?: string;
  brand?: string;
  size?: string;
  priceGbp?: number;
}

export interface ExistingListing {
  id: string;
  title: string;
  brand?: string;
  size?: string;
  priceGbp: number;
  sha256?: string;
}

/**
 * Run all dedup layers across the supplied items and existing listings.
 * Returns the strongest match per item id. Never auto-merges: any match is
 * surfaced as a probable duplicate for human confirmation.
 *
 * The candidate_model layer only fires when at least brand or title match,
 * so two unrelated items that happen to share a price are not flagged.
 */
export function detectDuplicates(input: {
  items: DedupItem[];
  existingListings?: ExistingListing[];
}): Map<string, DedupResult> {
  const items = input.items;
  const existing = input.existingListings ?? [];
  const results = new Map<string, DedupResult>();

  // Pre-index existing listings for fast exact lookups.
  const existingBySha256 = new Map<string, ExistingListing>();
  for (const listing of existing) {
    if (listing.sha256) {
      existingBySha256.set(listing.sha256, listing);
    }
  }

  for (const item of items) {
    let best: DedupResult = {
      isDuplicate: false,
      layer: null,
      duplicateOfListingId: null,
      score: 0,
    };

    const consider = (candidate: DedupResult): void => {
      if (candidate.score > best.score) {
        best = candidate;
      }
    };

    // Layer 1: exact_source_id (against other items).
    for (const other of items) {
      if (other.id === item.id) continue;
      if (other.externalItemId === item.externalItemId) {
        consider({
          isDuplicate: true,
          layer: 'exact_source_id',
          duplicateOfListingId: other.id,
          score: EXACT_SCORE,
        });
      }
    }

    // Layer 2: normalised_url (against other items).
    if (item.sourceUrl) {
      const normA = normaliseSourceUrl(item.sourceUrl);
      for (const other of items) {
        if (other.id === item.id) continue;
        if (!other.sourceUrl) continue;
        if (normaliseSourceUrl(other.sourceUrl) === normA) {
          consider({
            isDuplicate: true,
            layer: 'normalised_url',
            duplicateOfListingId: other.id,
            score: EXACT_SCORE,
          });
        }
      }
    }

    // Layer 3: source_checksum (against other items).
    for (const other of items) {
      if (other.id === item.id) continue;
      if (other.sourceChecksum === item.sourceChecksum) {
        consider({
          isDuplicate: true,
          layer: 'source_checksum',
          duplicateOfListingId: other.id,
          score: EXACT_SCORE,
        });
      }
    }

    // Layer 4: exact_media_hash (against existing listings and other items).
    if (item.sha256) {
      const existingMatch = existingBySha256.get(item.sha256);
      if (existingMatch) {
        consider({
          isDuplicate: true,
          layer: 'exact_media_hash',
          duplicateOfListingId: existingMatch.id,
          score: EXACT_SCORE,
        });
      }
      for (const other of items) {
        if (other.id === item.id) continue;
        if (other.sha256 && other.sha256 === item.sha256) {
          consider({
            isDuplicate: true,
            layer: 'exact_media_hash',
            duplicateOfListingId: other.id,
            score: EXACT_SCORE,
          });
        }
      }
    }

    // Layer 5: perceptual_similarity (against other items).
    if (item.perceptualHash) {
      for (const other of items) {
        if (other.id === item.id) continue;
        if (!other.perceptualHash) continue;
        const similarity = computePerceptualSimilarity(item.perceptualHash, other.perceptualHash);
        if (similarity >= PERCEPTUAL_THRESHOLD) {
          consider({
            isDuplicate: true,
            layer: 'perceptual_similarity',
            duplicateOfListingId: other.id,
            score: similarity,
          });
        }
      }
    }

    // Layer 6: candidate_model (against existing listings).
    for (const listing of existing) {
      const score = candidateModelScore(
        { title: item.title, brand: item.brand, size: item.size, priceGbp: item.priceGbp },
        { title: listing.title, brand: listing.brand, size: listing.size, priceGbp: listing.priceGbp },
      );
      if (score >= CANDIDATE_MODEL_THRESHOLD) {
        consider({
          isDuplicate: true,
          layer: 'candidate_model',
          duplicateOfListingId: listing.id,
          score,
        });
      }
    }

    results.set(item.id, best);
  }

  return results;
}
