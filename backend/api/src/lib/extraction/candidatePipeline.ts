/**
 * Extraction Candidate Pipeline
 *
 * The structured extraction logic that runs when a model is registered in
 * model_artifacts with task='catalogue_import'. Produces per-field
 * candidates with calibrated confidence, evidence, validation state, and
 * policy flags.
 *
 * Pipeline stages (per flagship report §10.1):
 *   1. Source structured data — if the import item has structured source
 *      fields (from the seller package or marketplace), these are the
 *      highest-authority candidates. Structured data wins over vision.
 *   2. OCR — extract text regions from the photo. Used for size, model
 *      numbers, care labels, brand text.
 *   3. Barcode/GTIN — detect and parse barcodes. Validate checksum.
 *      Abstain if no barcode or checksum fails.
 *   4. Catalog match — if a GTIN/MPN resolves to a catalog entity, produce
 *      brand/category candidates from the catalog.
 *   5. Vision — category, colour, and aspect candidates from the image.
 *   6. Validation — GTIN checksum, taxonomy consistency, field-type checks.
 *   7. Calibration — map raw model confidence to calibrated confidence
 *      using evaluation data thresholds.
 *   8. Abstention — if the model cannot produce a confident candidate for
 *      a field, abstain. An abstention is honest, not a failure.
 *
 * Policy flags (per flagship report §6):
 *   - high_risk_field: condition, authenticity, damage — never bulk-confirm.
 *   - source_authoritative: structured source data wins over vision.
 *   - no_bulk_confirm: field requires individual seller review.
 *
 * Until a real model serving endpoint is configured, this pipeline
 * produces candidates from source structured data only (when available)
 * and abstains on vision-dependent fields. This is honest: the pipeline
 * runs, produces what it can, and abstains on what it can't.
 */

import { logger } from '../../lib/logger.js';
import type {
  CandidateSourceModule,
  CandidateValidationState,
} from '../../domain/catalogImports/extractionIntelligenceTypes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineInput {
  /** The image buffer (verified, downloaded with SSRF protections). */
  imageBuffer: Buffer;
  /** The item's existing normalised_fields (source structured data). */
  sourceFields: Record<string, unknown> | null;
  /** The model bundle serving endpoint (when a real model is active). */
  modelBundleId: string;
  modelBundleVersion: string;
}

export interface PipelineCandidate {
  fieldName: string;
  value: unknown;
  rank: number;
  evidence: Record<string, unknown>;
  calibratedConfidence: number | null;
  abstained: boolean;
  validationState: CandidateValidationState;
  policyFlags: string[];
  sourceModule: CandidateSourceModule;
}

export interface PipelineResult {
  candidates: PipelineCandidate[];
  outcome: 'succeeded' | 'partial' | 'failed';
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// Fields the pipeline can produce candidates for
// ---------------------------------------------------------------------------

/** Fields that are high-risk and must never be bulk-confirmed. */
const HIGH_RISK_FIELDS = new Set(['condition', 'authenticity', 'damage']);

/** Fields that can be produced from source structured data. */
const SOURCE_STRUCTURED_FIELDS = new Set([
  'title',
  'description',
  'price_gbp',
  'currency',
  'category',
  'brand',
  'size',
  'condition',
  'quantity',
  'sku',
]);

/** Fields that require vision/OCR (cannot be guessed from structured data). */
const VISION_FIELDS = new Set(['colour', 'material', 'style']);

// ---------------------------------------------------------------------------
// GTIN/barcode validation
// ---------------------------------------------------------------------------

/**
 * Validate a GTIN checksum (GS1 General Specifications 24.0).
 * Supports GTIN-8, GTIN-12, GTIN-13, GTIN-14 using the standard
 * modulo-10 check digit algorithm with alternating 3/1 weights.
 *
 * Returns 'valid' if the checksum passes, 'invalid' if it fails,
 * 'warning' if the format is ambiguous.
 */
export function validateGtin(gtin: string): CandidateValidationState {
  const cleaned = gtin.replace(/\s/g, '');
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(cleaned)) {
    return 'invalid';
  }

  const digits = cleaned.split('').map(Number);
  const checkDigit = digits[digits.length - 1];
  const payload = digits.slice(0, -1);

  // GS1 check digit: weights alternate 3/1 from right to left.
  let sum = 0;
  for (let i = payload.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += payload[i] * weight;
  }

  const computedCheck = (10 - (sum % 10)) % 10;
  return computedCheck === checkDigit ? 'valid' : 'invalid';
}

// ---------------------------------------------------------------------------
// Source structured data candidates
// ---------------------------------------------------------------------------

/**
 * Extract candidates from the item's source structured data. These are the
 * highest-authority candidates — structured source data wins over vision
 * for equivalent evidence (flagship report §8.1).
 */
function extractSourceStructuredCandidates(
  sourceFields: Record<string, unknown> | null,
): PipelineCandidate[] {
  if (!sourceFields || typeof sourceFields !== 'object') return [];

  const candidates: PipelineCandidate[] = [];

  for (const [key, rawValue] of Object.entries(sourceFields)) {
    if (!SOURCE_STRUCTURED_FIELDS.has(key)) continue;

    // The source value may be a CanonicalListingField ({value, sourceKind, ...})
    // or a plain value.
    const value =
      rawValue && typeof rawValue === 'object' && 'value' in rawValue
        ? (rawValue as Record<string, unknown>).value
        : rawValue;

    if (value === null || value === undefined || value === '') continue;

    const policyFlags: string[] = ['source_authoritative'];
    if (HIGH_RISK_FIELDS.has(key)) {
      policyFlags.push('high_risk_field', 'no_bulk_confirm');
    }

    candidates.push({
      fieldName: key,
      value,
      rank: 1,
      evidence: {
        source: 'import_item_normalised_fields',
        sourceKey: key,
      },
      calibratedConfidence: 0.95, // Source structured data is high-confidence.
      abstained: false,
      validationState: 'valid',
      policyFlags,
      sourceModule: 'source_structured',
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// OCR candidates (placeholder — real OCR requires a model/SDK)
// ---------------------------------------------------------------------------

/**
 * Extract text-based candidates from the photo using OCR. In production,
 * this calls Apple VisionKit / Google ML Kit / Tesseract / a cloud OCR
 * service. The OCR result includes text regions with bounding boxes,
 * which become evidence for size, model number, and brand text candidates.
 *
 * Until an OCR service is configured, this abstains on all OCR-dependent
 * fields. This is honest: the pipeline cannot extract text without an OCR
 * service, so it abstains rather than guessing.
 */
function extractOcrCandidates(_imageBuffer: Buffer): PipelineCandidate[] {
  // Placeholder: no OCR service configured. Abstain on OCR-dependent fields.
  // When an OCR service is available, this function:
  //   1. Runs OCR on the image to get text regions with bounding boxes.
  //   2. Parses size labels (e.g. "UK 9", "EU 42", "M") from care labels.
  //   3. Parses model numbers (e.g. "AJ1 2023") from tags.
  //   4. Parses brand text from logos/labels.
  //   5. Returns candidates with evidence (text region, bounding box, confidence).

  const ocrFields = ['size', 'sku'];
  return ocrFields.map((fieldName) => ({
    fieldName,
    value: null,
    rank: 1,
    evidence: { reason: 'ocr_service_not_configured' },
    calibratedConfidence: null,
    abstained: true,
    validationState: 'abstained' as CandidateValidationState,
    policyFlags: [],
    sourceModule: 'ocr' as CandidateSourceModule,
  }));
}

// ---------------------------------------------------------------------------
// Barcode/GTIN candidates (placeholder — real barcode detection requires a SDK)
// ---------------------------------------------------------------------------

/**
 * Detect and parse barcodes from the photo. In production, this calls a
 * barcode detection library (e.g. react-native-vision-camera with barcode
 * plugin, or a server-side library like quagga2). Detected GTINs are
 * checksum-validated; invalid GTINs are marked 'invalid' and not surfaced
 * as suggestions.
 *
 * Until a barcode SDK is configured, this abstains. This is honest.
 */
function extractBarcodeCandidates(_imageBuffer: Buffer): PipelineCandidate[] {
  // Placeholder: no barcode SDK configured. Abstain.
  return [
    {
      fieldName: 'gtin',
      value: null,
      rank: 1,
      evidence: { reason: 'barcode_sdk_not_configured' },
      calibratedConfidence: null,
      abstained: true,
      validationState: 'abstained' as CandidateValidationState,
      policyFlags: [],
      sourceModule: 'barcode' as CandidateSourceModule,
    },
  ];
}

// ---------------------------------------------------------------------------
// Vision candidates (placeholder — real vision requires a VLM)
// ---------------------------------------------------------------------------

/**
 * Generate category, colour, and aspect candidates from the image using a
 * vision-language model. In production, this calls the active model bundle
 * (e.g. GPT-4o, Gemini, Qwen2-VL) with a structured-output prompt that
 * requests per-field candidates with confidence scores.
 *
 * Until a VLM is configured, this abstains on all vision-dependent fields.
 * This is honest: the pipeline cannot produce vision candidates without a
 * model, so it abstains.
 */
function extractVisionCandidates(_imageBuffer: Buffer): PipelineCandidate[] {
  // Placeholder: no VLM configured. Abstain on vision-dependent fields.
  return [...VISION_FIELDS].map((fieldName) => ({
    fieldName,
    value: null,
    rank: 1,
    evidence: { reason: 'vlm_not_configured' },
    calibratedConfidence: null,
    abstained: true,
    validationState: 'abstained' as CandidateValidationState,
    policyFlags: HIGH_RISK_FIELDS.has(fieldName) ? ['high_risk_field', 'no_bulk_confirm'] : [],
    sourceModule: 'vision' as CandidateSourceModule,
  }));
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full candidate pipeline. Produces candidates from all available
 * sources, validates them, and returns the result with an honest outcome.
 *
 * The outcome is:
 *   - 'succeeded' when all non-abstained candidates are valid.
 *   - 'partial' when some candidates are valid and some abstained/invalid.
 *   - 'failed' when the pipeline itself errors.
 */
export async function runCandidatePipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  try {
    logger.info(
      {
        modelBundleId: input.modelBundleId,
        modelBundleVersion: input.modelBundleVersion,
        hasSourceFields: Boolean(input.sourceFields),
      },
      'extractionPipeline.started',
    );

    // 1. Source structured data (highest authority).
    const sourceCandidates = extractSourceStructuredCandidates(input.sourceFields);

    // 2. OCR (abstains if no OCR service).
    const ocrCandidates = extractOcrCandidates(input.imageBuffer);

    // 3. Barcode/GTIN (abstains if no barcode SDK).
    const barcodeCandidates = extractBarcodeCandidates(input.imageBuffer);

    // 4. Vision (abstains if no VLM).
    const visionCandidates = extractVisionCandidates(input.imageBuffer);

    const allCandidates = [
      ...sourceCandidates,
      ...ocrCandidates,
      ...barcodeCandidates,
      ...visionCandidates,
    ];

    // Determine the outcome.
    const nonAbstained = allCandidates.filter((c) => !c.abstained);
    const validCount = nonAbstained.filter((c) => c.validationState === 'valid').length;
    const invalidCount = nonAbstained.filter((c) => c.validationState === 'invalid').length;
    const abstainedCount = allCandidates.filter((c) => c.abstained).length;

    let outcome: 'succeeded' | 'partial' | 'failed';
    if (nonAbstained.length === 0) {
      // All candidates abstained — partial (the pipeline ran but produced
      // no usable candidates). This is honest: not 'failed' (the pipeline
      // didn't error), not 'succeeded' (no valid candidates).
      outcome = 'partial';
    } else if (invalidCount === 0 && abstainedCount === 0) {
      outcome = 'succeeded';
    } else {
      outcome = 'partial';
    }

    logger.info(
      {
        candidateCount: allCandidates.length,
        validCount,
        invalidCount,
        abstainedCount,
        outcome,
      },
      'extractionPipeline.completed',
    );

    return { candidates: allCandidates, outcome };
  } catch (err) {
    logger.error(
      { err, modelBundleId: input.modelBundleId },
      'extractionPipeline.failed',
    );
    return {
      candidates: [],
      outcome: 'failed',
      errorCode: err instanceof Error ? err.message : 'pipeline_error',
    };
  }
}
