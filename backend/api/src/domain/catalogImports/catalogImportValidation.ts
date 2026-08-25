/**
 * Catalogue Import — Validation Helpers
 *
 * Pure validation functions for attestation, package uploads, batch creation,
 * and item patches. No side effects, no database access. Route handlers and
 * the domain service call these before mutating any row so invalid inputs are
 * rejected at the boundary.
 *
 * Per blueprint §6: "Validate every state transition through the state
 * machine functions" and §11: "The seller must attest that they own the
 * rights, that the facts are accurate, and that no buyer data is included."
 */

import type { CatalogSource } from './catalogImportTypes.js';

// ---------------------------------------------------------------------------
// Attestation validation
// ---------------------------------------------------------------------------

export interface AttestationInput {
  ownsRights: boolean;
  accurateFacts: boolean;
  noBuyerData: boolean;
}

export interface AttestationValidationResult {
  valid: boolean;
  missing: string[];
}

/**
 * Validates that the seller has attested to all three required legal
 * assertions before a batch can be approved. Per blueprint §11, all three
 * must be explicitly true — a missing or false attestation blocks approval.
 */
export function validateAttestation(
  attestation: AttestationInput,
): AttestationValidationResult {
  const missing: string[] = [];

  if (!attestation.ownsRights) {
    missing.push('ownsRights');
  }
  if (!attestation.accurateFacts) {
    missing.push('accurateFacts');
  }
  if (!attestation.noBuyerData) {
    missing.push('noBuyerData');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Package upload validation
// ---------------------------------------------------------------------------

const ALLOWED_PACKAGE_CONTENT_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
]);

const MAX_PACKAGE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export interface PackageUploadInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface PackageUploadValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validates a seller package upload before it is accepted. The content type
 * must be CSV (or the Excel MIME that some browsers report for CSV), and the
 * size must not exceed the 100 MB limit enforced by the seller package
 * connector.
 */
export function validatePackageUpload(
  input: PackageUploadInput,
): PackageUploadValidationResult {
  if (!input.fileName || input.fileName.trim().length === 0) {
    return { valid: false, error: 'File name is required' };
  }

  const normalizedContentType = input.contentType.toLowerCase().trim();
  if (!ALLOWED_PACKAGE_CONTENT_TYPES.has(normalizedContentType)) {
    return {
      valid: false,
      error: `Unsupported content type "${input.contentType}". Allowed: text/csv, application/vnd.ms-excel.`,
    };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { valid: false, error: 'File size must be a positive number' };
  }

  if (input.sizeBytes > MAX_PACKAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size ${input.sizeBytes} bytes exceeds the maximum of ${MAX_PACKAGE_SIZE_BYTES} bytes (100 MB)`,
    };
  }

  return { valid: true, error: null };
}

// ---------------------------------------------------------------------------
// Batch creation validation
// ---------------------------------------------------------------------------

export interface BatchCreateInput {
  source: CatalogSource;
  connectionId?: string | null;
  packageId?: string | null;
  consentVersion: string;
}

export interface BatchCreateValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validates the inputs for creating a new import batch. The requirements
 * differ by source:
 * - `seller_package` requires a packageId (the uploaded archive reference)
 *   and does not use an OAuth connection.
 * - OAuth sources (ebay, depop, vinted) require a connectionId (an active
 *   authorisation grant).
 * - consentVersion is always required — no batch is created without
 *   recorded consent.
 */
export function validateBatchCreate(
  input: BatchCreateInput,
): BatchCreateValidationResult {
  if (!input.consentVersion || input.consentVersion.trim().length === 0) {
    return { valid: false, error: 'Consent version is required' };
  }

  if (input.source === 'seller_package') {
    if (!input.packageId || input.packageId.trim().length === 0) {
      return {
        valid: false,
        error: 'A package ID is required for seller_package imports',
      };
    }
    return { valid: true, error: null };
  }

  // OAuth-based sources (ebay, depop, vinted)
  if (!input.connectionId || input.connectionId.trim().length === 0) {
    return {
      valid: false,
      error: `A connection ID is required for ${input.source} imports`,
    };
  }

  return { valid: true, error: null };
}

// ---------------------------------------------------------------------------
// Item patch validation
// ---------------------------------------------------------------------------

export interface ItemPatchInput {
  fieldRevision: string;
  fields: Record<string, unknown>;
}

export interface ItemPatchValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validates a patch to an item's normalised fields. The field revision must
 * be present (for optimistic concurrency) and the fields object must be a
 * non-null record. Individual field-level validation is performed by the
 * mapping layer; this is a structural guard.
 */
export function validateItemPatch(
  input: ItemPatchInput,
): ItemPatchValidationResult {
  if (!input.fieldRevision || input.fieldRevision.trim().length === 0) {
    return {
      valid: false,
      error: 'Field revision is required for optimistic concurrency',
    };
  }

  if (!input.fields || typeof input.fields !== 'object') {
    return { valid: false, error: 'Fields must be a record object' };
  }

  if (Array.isArray(input.fields)) {
    return { valid: false, error: 'Fields must be a record object, not an array' };
  }

  return { valid: true, error: null };
}
