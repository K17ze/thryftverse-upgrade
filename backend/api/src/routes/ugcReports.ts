// ─────────────────────────────────────────────────────────────────────────────
// UGC Reports — one polymorphic report endpoint for content surfaces that
// have no dedicated report route: looks, look comments, posters, moodboard
// comments and listing Q&A.
//
// Reports bridge into the safety case graph via recordConsumerReport with
// kind 'ugc' — the concrete subject type travels in the subject snapshot so
// ops tooling can distinguish surfaces, while severity>=3 reasons can
// auto-limit the author's reach (subject resolution targets the author).
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { recordConsumerReport } from '../lib/safetyCaseService.js';
import { createRuntimeId } from '../lib/workerHelpers.js';

type UgcReportRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  resolveAuthenticatedUserId: (request: FastifyRequest) => string;
};

/** Subject types the polymorphic endpoint accepts. */
const UGC_SUBJECT_TYPES = [
  'look',
  'look_comment',
  'poster',
  'moodboard_comment',
  'listing_qa',
] as const;

type UgcSubjectType = (typeof UGC_SUBJECT_TYPES)[number];

/**
 * How each subject type resolves its author. `column` is the owner/author
 * column on the subject table; `context` is an optional parent id column
 * carried into the report snapshot for reviewer context.
 */
const SUBJECT_RESOLVERS: Record<
  UgcSubjectType,
  { table: string; authorColumn: string; contextColumn: string | null }
> = {
  look: { table: 'looks', authorColumn: 'creator_id', contextColumn: null },
  look_comment: { table: 'look_comments', authorColumn: 'author_id', contextColumn: 'look_id' },
  poster: { table: 'posters', authorColumn: 'creator_id', contextColumn: null },
  moodboard_comment: {
    table: 'moodboard_comments',
    authorColumn: 'author_id',
    contextColumn: 'board_id',
  },
  listing_qa: { table: 'listing_qa', authorColumn: 'asker_id', contextColumn: 'listing_id' },
};

const reportBodySchema = z.object({
  subjectType: z.enum(UGC_SUBJECT_TYPES),
  subjectId: z.string().trim().min(1).max(200),
  reason: z.enum([
    'spam',
    'inappropriate',
    'counterfeit',
    'harassment',
    'off_platform',
    'hate_speech',
    'prohibited',
    'scam',
    'misinformation',
    'privacy',
    'impersonation',
    'minor_safety',
    'other',
  ]),
  details: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().min(2).max(200).optional(),
});

export function registerUgcReportRoutes({
  app,
  db,
  resolveAuthenticatedUserId,
}: UgcReportRouteDependencies): void {
  app.post('/ugc/reports', async (request, reply) => {
    const reporterId = resolveAuthenticatedUserId(request);
    const payload = reportBodySchema.parse(request.body ?? {});

    const resolver = SUBJECT_RESOLVERS[payload.subjectType];
    // Table/column names are compile-time constants from SUBJECT_RESOLVERS —
    // the subject id is always a bound parameter, never interpolated.
    const contextSelect = resolver.contextColumn ? `, ${resolver.contextColumn} AS context_id` : '';
    const subjectResult = await db.query<{ author_id: string; context_id?: string }>(
      `SELECT ${resolver.authorColumn} AS author_id${contextSelect}
       FROM ${resolver.table} WHERE id = $1 LIMIT 1`,
      [payload.subjectId],
    );
    const subject = subjectResult.rows[0];
    if (!subject) {
      reply.code(404);
      return { ok: false, error: 'Reported content not found', code: 'UGC_SUBJECT_NOT_FOUND' };
    }
    if (subject.author_id === reporterId) {
      reply.code(400);
      return { ok: false, error: 'You cannot report your own content', code: 'UGC_REPORT_SELF' };
    }

    const { reportId, duplicated } = await recordConsumerReport(db, {
      kind: 'ugc',
      reportId: createRuntimeId('ugcrpt'),
      reporterId,
      subjectId: payload.subjectId,
      reason: payload.reason,
      details: payload.details ?? null,
      idempotencyKey: payload.idempotencyKey ?? null,
      subjectSnapshot: {
        subjectType: payload.subjectType,
        authorUserId: subject.author_id,
        parentContextId: subject.context_id ?? null,
      },
    });

    reply.code(duplicated ? 200 : 201);
    return { ok: true, reportId, duplicated };
  });
}
