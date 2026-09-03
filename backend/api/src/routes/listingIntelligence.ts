import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

type ListingIntelligenceRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

const LISTING_INTELLIGENCE_VERSION = 'listing-intel-v1-2026-08-25.1';

const runSuggestionsSchema = z.object({
  listingId: z.string().min(2).max(120).optional(),
  photos: z
    .array(
      z.object({
        id: z.string().min(2).max(120),
        url: z.string().url().max(2048),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(20),
  filename: z.string().min(1).max(500).optional(),
  sellerNotes: z.string().max(2000).optional(),
  categoryHint: z.string().max(120).optional(),
  idempotencyKey: z.string().min(8).max(140).optional(),
});

/**
 * Field-level suggestion candidate for a single listing field.
 * Each candidate carries evidence (what in the input supports this value)
 * and an abstention flag (the system can say "I don't know").
 */
type FieldCandidate = {
  field: string;
  value: string;
  evidence: {
    source: 'filename' | 'photo' | 'seller_notes' | 'category_hint';
    detail: string;
  };
  abstained: boolean;
};

type SuggestionRun = {
  id: string;
  listingId: string | null;
  candidates: FieldCandidate[];
  version: string;
  createdAt: string;
};

/**
 * Extract field-level candidates from the filename.
 * This is a heuristic parser — it does NOT fabricate fields it cannot
 * evidence from the filename. Fields with no evidence are abstained.
 */
function parseFilename(filename: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const baseName = filename.replace(/\.[^.]+$/, ''); // strip extension
  const parts = baseName.split(/[-_\s]+/).filter(Boolean);

  // Brand detection: look for known brand patterns in the filename.
  // This is intentionally conservative — only brands with clear evidence
  // in the filename are suggested.
  const knownBrands = [
    'nike', 'adidas', 'zara', 'h&m', 'uniqlo', 'levis', 'converse',
    'vans', 'patagonia', 'northface', 'thenorthface', 'carhartt',
    'supreme', 'stussy', 'gucci', 'prada', 'burberry', 'ralphlauren',
    'lacoste', 'tommy', 'calvinklein', 'armani', 'stoneisland',
  ];
  const lowerParts = parts.map((p) => p.toLowerCase());
  for (const brand of knownBrands) {
    const matchIdx = lowerParts.findIndex((p) => p === brand || p.includes(brand));
    if (matchIdx >= 0) {
      // Use the original-cased part as the value.
      candidates.push({
        field: 'brand',
        value: capitalizeBrand(parts[matchIdx]),
        evidence: {
          source: 'filename',
          detail: `Found "${parts[matchIdx]}" in filename`,
        },
        abstained: false,
      });
      break;
    }
  }

  // Size detection: look for common size patterns.
  const sizePattern = /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl|6xl|onesize|os)$/i;
  const sizeMatch = lowerParts.find((p) => sizePattern.test(p));
  if (sizeMatch) {
    candidates.push({
      field: 'size',
      value: sizeMatch.toUpperCase().replace('OS', 'One Size'),
      evidence: {
        source: 'filename',
        detail: `Found size token "${sizeMatch}" in filename`,
      },
      abstained: false,
    });
  }

  // Numeric size detection (e.g., "32", "28W", "40R").
  const numericSizePattern = /^(\d{2})([wrlx])?$/i;
  const numericMatch = parts.find((p) => numericSizePattern.test(p));
  if (numericMatch && !sizeMatch) {
    candidates.push({
      field: 'size',
      value: numericMatch.toUpperCase(),
      evidence: {
        source: 'filename',
        detail: `Found numeric size "${numericMatch}" in filename`,
      },
      abstained: false,
    });
  }

  // Color detection: look for common color words.
  const knownColors = [
    'black', 'white', 'grey', 'gray', 'navy', 'blue', 'red', 'green',
    'brown', 'beige', 'cream', 'pink', 'yellow', 'orange', 'purple',
    'burgundy', 'olive', 'khaki', 'charcoal', 'ivory', 'tan',
  ];
  const colorMatch = lowerParts.find((p) => knownColors.includes(p));
  if (colorMatch) {
    candidates.push({
      field: 'color',
      value: capitalizeFirst(colorMatch),
      evidence: {
        source: 'filename',
        detail: `Found color "${colorMatch}" in filename`,
      },
      abstained: false,
    });
  }

  // Title: use the filename itself as a title candidate, cleaned up.
  const cleanTitle = baseName
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanTitle.length >= 3) {
    candidates.push({
      field: 'title',
      value: capitalizeWords(cleanTitle),
      evidence: {
        source: 'filename',
        detail: 'Derived from the uploaded filename',
      },
      abstained: false,
    });
  }

  return candidates;
}

/**
 * Extract candidates from seller notes (free-text the seller typed).
 */
function parseSellerNotes(notes: string): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const lowerNotes = notes.toLowerCase();

  // Condition detection from seller notes.
  const conditionPatterns: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /\bbrand new\b|\bnwt\b|\bnwot\b|\bnever worn\b/i, value: 'New' },
    { pattern: /\blike new\b|\bbarely worn\b|\bonce\b|\bgently worn\b/i, value: 'Like new' },
    { pattern: /\bvery good\b|\bgood condition\b|\bexcellent\b/i, value: 'Very good' },
    { pattern: /\bgood\b(?! condition)/i, value: 'Good' },
    { pattern: /\bfair\b|\bworn\b|\bsigns of wear\b/i, value: 'Fair' },
  ];
  for (const { pattern, value } of conditionPatterns) {
    if (pattern.test(notes)) {
      candidates.push({
        field: 'condition',
        value,
        evidence: {
          source: 'seller_notes',
          detail: `Seller wrote: "${notes.slice(0, 100)}"`,
        },
        abstained: false,
      });
      break;
    }
  }

  // Brand mention in notes.
  const knownBrands = [
    'nike', 'adidas', 'zara', 'uniqlo', 'levi', 'converse',
    'vans', 'patagonia', 'north face', 'carhartt', 'supreme',
  ];
  for (const brand of knownBrands) {
    if (lowerNotes.includes(brand)) {
      candidates.push({
        field: 'brand',
        value: capitalizeBrand(brand),
        evidence: {
          source: 'seller_notes',
          detail: `Seller mentioned "${brand}" in notes`,
        },
        abstained: false,
      });
      break;
    }
  }

  return candidates;
}

/**
 * Generate abstention candidates for fields that have no evidence.
 * This is the key anti-fabrication mechanism: the system explicitly
 * says "I don't know" for fields it cannot evidence.
 */
function generateAbstentions(presentFields: Set<string>): FieldCandidate[] {
  const allFields = ['title', 'brand', 'size', 'color', 'condition', 'category'];
  const abstentions: FieldCandidate[] = [];
  for (const field of allFields) {
    if (!presentFields.has(field)) {
      abstentions.push({
        field,
        value: '',
        evidence: {
          source: 'filename',
          detail: 'No evidence found in the provided input',
        },
        abstained: true,
      });
    }
  }
  return abstentions;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function capitalizeWords(s: string): string {
  return s.split(' ').map(capitalizeFirst).join(' ');
}

function capitalizeBrand(s: string): string {
  const special: Record<string, string> = {
    'h&m': 'H&M',
    'nike': 'Nike',
    'adidas': 'adidas',
    'zara': 'Zara',
    'uniqlo': 'UNIQLO',
    'levis': "Levi's",
    'converse': 'Converse',
    'vans': 'Vans',
    'patagonia': 'Patagonia',
    'northface': 'The North Face',
    'thenorthface': 'The North Face',
    'carhartt': 'Carhartt',
    'supreme': 'Supreme',
    'stussy': 'Stüssy',
    'gucci': 'Gucci',
    'prada': 'Prada',
    'burberry': 'Burberry',
    'ralphlauren': 'Ralph Lauren',
    'lacoste': 'Lacoste',
    'tommy': 'Tommy Hilfiger',
    'calvinklein': 'Calvin Klein',
    'armani': 'Armani',
    'stoneisland': 'Stone Island',
  };
  return special[s.toLowerCase()] ?? capitalizeFirst(s);
}

export const registerListingIntelligenceRoutes = ({
  app,
  db,
  resolveAuthenticatedUserId,
}: ListingIntelligenceRouteDependencies) => {
  // ── POST /listing-intelligence/run — generate field-level suggestions ─────
  //
  // This endpoint is advisory only. It never auto-applies suggestions.
  // The seller reviews each field candidate and decides whether to accept
  // or reject it. Fields with no evidence are explicitly abstained.
  app.post('/listing-intelligence/run', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const payload = runSuggestionsSchema.parse(request.body);

    const runId = `lir_${crypto.randomUUID()}`;
    const candidates: FieldCandidate[] = [];

    // Parse filename for evidence.
    if (payload.filename) {
      candidates.push(...parseFilename(payload.filename));
    }

    // Parse seller notes for evidence.
    if (payload.sellerNotes) {
      candidates.push(...parseSellerNotes(payload.sellerNotes));
    }

    // Deduplicate: if multiple sources suggest the same field, prefer the
    // first evidence (filename > seller notes).
    const seenFields = new Set<string>();
    const dedupedCandidates: FieldCandidate[] = [];
    for (const candidate of candidates) {
      if (!seenFields.has(candidate.field)) {
        dedupedCandidates.push(candidate);
        seenFields.add(candidate.field);
      }
    }

    // Generate abstentions for fields with no evidence.
    const abstentions = generateAbstentions(seenFields);
    const allCandidates = [...dedupedCandidates, ...abstentions];

    const run: SuggestionRun = {
      id: runId,
      listingId: payload.listingId ?? null,
      candidates: allCandidates,
      version: LISTING_INTELLIGENCE_VERSION,
      createdAt: new Date().toISOString(),
    };

    // Persist the run for auditability.
    const client = await db.connect();
    try {
      await client.query(
        `INSERT INTO listing_intelligence_runs (
           id, listing_id, seller_id, candidates, version, created_at
         )
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          runId,
          payload.listingId ?? null,
          actorUserId,
          JSON.stringify(allCandidates),
          LISTING_INTELLIGENCE_VERSION,
          run.createdAt,
        ],
      );
    } catch (error) {
      // Non-fatal: the run is returned to the client regardless. Persistence
      // is for audit only.
      app.log.error({ err: error, runId }, 'Failed to persist listing intelligence run');
    } finally {
      client.release();
    }

    reply.code(200);
    return { ok: true, run };
  });

  // ── GET /listing-intelligence/runs/:runId — retrieve a past run ───────────
  app.get('/listing-intelligence/runs/:runId', async (request, reply) => {
    const actorUserId = resolveAuthenticatedUserId(request);
    const { runId } = z
      .object({ runId: z.string().min(2).max(120) })
      .parse(request.params);

    const result = await db.query<{
      id: string;
      listing_id: string | null;
      seller_id: string;
      candidates: FieldCandidate[];
      version: string;
      created_at: string;
    }>(
      `SELECT id, listing_id, seller_id, candidates, version, created_at::text
       FROM listing_intelligence_runs
       WHERE id = $1
       LIMIT 1`,
      [runId],
    );
    if (!result.rowCount) {
      reply.code(404);
      return { ok: false, error: 'Listing intelligence run not found' };
    }
    const row = result.rows[0];
    if (row.seller_id !== actorUserId) {
      reply.code(403);
      return { ok: false, error: 'Only the requesting seller can view this run' };
    }
    return {
      ok: true,
      run: {
        id: row.id,
        listingId: row.listing_id,
        candidates: row.candidates,
        version: row.version,
        createdAt: row.created_at,
      },
    };
  });
};
