import { z } from 'zod';

import { CreatorPageSchema } from './pages';
import { CreatorBackgroundSchema } from './pages';
import { CreatorMetadataSchema } from './metadata';

// ── Full document schema ───────────────────────────────────────────

const AssetRegistryEntrySchema = z.object({
  uri: z.string(),
  type: z.enum(['image', 'video']),
  mimeType: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export type AssetRegistryEntry = z.infer<typeof AssetRegistryEntrySchema>;

export const CreatorDocumentSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['look', 'poster']),
  version: z.number().int().min(1).default(1),
  // WYSIWYG render contract version — identifies the render pipeline revision
  // the authored document targets (Phase 8). Optional; absent on legacy docs.
  renderVersion: z.string().optional(),
  canvas: z.object({
    aspectRatio: z.number().min(0.3).max(3).default(0.8),
    background: CreatorBackgroundSchema,
    /**
     * Project frame rate — the output/timeline frame grid (CapCut's
     * `draft.fps`, not source fps). Trim/slip/split quantize to this
     * grid and export encodes at it. Absent on legacy docs → 30.
     */
    fps: z.number().min(1).max(120).optional(),
  }),
  pages: z.array(CreatorPageSchema).min(1).max(10),
  metadata: CreatorMetadataSchema,
  assetRegistry: z.record(z.string(), AssetRegistryEntrySchema).optional(),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type CreatorDocument = z.infer<typeof CreatorDocumentSchema>;

// ── Validation helpers ─────────────────────────────────────────────

export function validateDocument(doc: unknown): CreatorDocument {
  return CreatorDocumentSchema.parse(doc);
}

export function safeValidateDocument(doc: unknown): { success: boolean; data?: CreatorDocument; error?: string } {
  const result = CreatorDocumentSchema.safeParse(doc);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
