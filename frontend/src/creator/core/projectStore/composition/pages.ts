import { z } from 'zod';

import { CreatorLayerSchema } from './layers';

// ── Page schema ────────────────────────────────────────────────────

export const CreatorPageSchema = z.object({
  id: z.string().min(1),
  durationMs: z.number().int().min(500).max(60000).optional(),
  layers: z.array(CreatorLayerSchema).default([]),
  // Transition applied between this page and the next (Phase 9).
  // References a TransitionPreset id from TransitionPresets.ts.
  transitionId: z.string().optional(),
});

export type CreatorPage = z.infer<typeof CreatorPageSchema>;

// ── Background schema ──────────────────────────────────────────────

export const CreatorBackgroundSchema = z.object({
  type: z.enum(['color', 'gradient', 'image', 'blur']).default('color'),
  value: z.string().default('#1a1a1a'),
  secondaryValue: z.string().optional(),
  // Custom gradient stops — when type='gradient' and the user has edited
  // stops via the GradientEditor. Each stop has a 0..1 position and a hex
  // color string (#RRGGBB or #RRGGBBAA). When absent, the renderer falls
  // back to value/secondaryValue (two-stop preset gradient).
  gradientStops: z.array(z.object({
    position: z.number().min(0).max(1),
    color: z.string(),
  })).optional(),
  // Gradient angle in degrees (0..360). Used when type='gradient'.
  gradientAngle: z.number().min(0).max(360).optional(),
  // For 'blur' type — the asset ID of the source image to blur.
  // The renderer blurs this image and uses it as the canvas background.
  blurAssetId: z.string().optional(),
  blurRadius: z.number().min(0).max(50).optional(),
  // For 'image' type — optional blur intensity (0–20) applied to the
  // background image via expo-image's blurRadius. 0 = no blur.
  imageBlur: z.number().min(0).max(20).optional(),
  // For 'image' type — upload receipts written back by the publish
  // pipeline so the server coverage walker can bind the remote URL to a
  // verified upload (same contract as media-layer receipts).
  mediaFinalizationId: z.string().optional(),
  mediaAssetId: z.string().optional(),
});

export type CreatorBackground = z.infer<typeof CreatorBackgroundSchema>;
