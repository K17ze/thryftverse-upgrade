import { z } from 'zod';

// ── Metadata schema ────────────────────────────────────────────────

export const CreatorMetadataSchema = z.object({
  caption: z.string().max(2200).default(''),
  title: z.string().max(120).default(''),
  visibility: z.enum(['public', 'closeFriends', 'private']).default('public'),
  allowReplies: z.boolean().default(true),
  allowReactions: z.boolean().default(true),
  expiresInHours: z.number().int().min(1).max(168).optional(),
  accessibilityDescription: z.string().max(300).optional(),
  allowRemix: z.boolean().default(false),
  sourceDocumentId: z.string().optional(),
  sourceCreatorId: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  coverPageIndex: z.number().int().min(0).optional(),
  /** Last timeline playhead position (ms) — restored when a draft is
      reopened so editing resumes where the user left off. Written
      silently (no history entry) since it is session state, not content. */
  playheadMs: z.number().nonnegative().optional(),
});

export type CreatorMetadata = z.infer<typeof CreatorMetadataSchema>;
