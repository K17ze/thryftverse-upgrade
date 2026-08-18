/**
 * Runtime Zod schema for the project package.
 *
 * Every project load runs through `validateProject()` to ensure the on-disk
 * JSON conforms to the expected shape. Invalid projects trigger recovery from
 * the `.bak` checkpoint (see ProjectStore).
 *
 * The `composition` field is validated as `z.unknown()` here because it has
 * its own dedicated schema in `composition.ts` (CreatorDocumentSchema).
 * Callers that need full composition validation should run
 * `safeValidateDocument()` separately after project validation succeeds.
 */

import { z } from 'zod';

import { PROJECT_SCHEMA_VERSION } from './projectTypes';
import type { ProjectPackage } from './projectTypes';

// ── Asset index schema ──────────────────────────────────────────────

export const ProjectAssetEntrySchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'mask']),
  originalFilename: z.string(),
  localPath: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().nonnegative(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationMs: z.number().optional(),
  importedAt: z.number(),
  source: z.enum(['camera', 'gallery', 'replace', 'look', 'generated']),
});

// Zod 4 requires z.record(keySchema, valueSchema) — two arguments.
export const ProjectAssetIndexSchema = z.record(
  z.string(),
  ProjectAssetEntrySchema,
);

// ── Project package schema ──────────────────────────────────────────

export const ProjectPackageSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  projectId: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  // composition has its own schema (CreatorDocumentSchema); validated
  // separately by callers that need full composition validation.
  composition: z.unknown(),
  assets: ProjectAssetIndexSchema,
  thumbnailAssetId: z.string().optional(),
  coverFrameAssetId: z.string().optional(),
  folderId: z.string().nullable().optional(),
  publishedAt: z.number().optional(),
  publishId: z.string().optional(),
});

// ── Validation helpers ──────────────────────────────────────────────

/**
 * Validate an unknown payload against the project package schema.
 *
 * Returns the validated `ProjectPackage` on success, or `null` on failure
 * (with issues logged to `console.warn`). This is a safe parse — it never
 * throws.
 */
export function validateProject(raw: unknown): ProjectPackage | null {
  const result = ProjectPackageSchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      '[ProjectStore] Project validation failed:',
      result.error.issues,
    );
    return null;
  }
  return result.data as ProjectPackage;
}

/**
 * Check whether a raw payload has a recognizable version field without
 * fully validating the entire package. Used by the migration layer to
 * decide whether to attempt a migration.
 */
export function extractVersion(raw: unknown): number | null {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'version' in raw &&
    typeof (raw as Record<string, unknown>).version === 'number'
  ) {
    return (raw as Record<string, unknown>).version as number;
  }
  return null;
}

/**
 * The current schema version, re-exported for convenience.
 */
export { PROJECT_SCHEMA_VERSION };
