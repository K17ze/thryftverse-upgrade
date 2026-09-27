import { fetchJson } from '../lib/apiClient';

/**
 * Polymorphic UGC report — one backend endpoint (`POST /ugc/reports`)
 * covers every content surface that has no dedicated report route:
 * looks, look comments, posters, moodboard comments and listing Q&A.
 * Reports bridge into the safety case graph server-side.
 */
export type UgcSubjectType =
  | 'look'
  | 'look_comment'
  | 'poster'
  | 'moodboard_comment'
  | 'listing_qa';

export type UgcReportReason =
  | 'spam'
  | 'inappropriate'
  | 'counterfeit'
  | 'harassment'
  | 'off_platform'
  | 'hate_speech'
  | 'prohibited'
  | 'scam'
  | 'misinformation'
  | 'privacy'
  | 'impersonation'
  | 'minor_safety'
  | 'other';

export async function reportUgcContent(
  subjectType: UgcSubjectType,
  subjectId: string,
  reason: UgcReportReason,
  details?: string,
  idempotencyKey?: string,
): Promise<{ reportId: string }> {
  const response = await fetchJson<{ ok: boolean; reportId: string }>(
    '/ugc/reports',
    {
      method: 'POST',
      body: JSON.stringify({
        subjectType,
        subjectId,
        reason,
        details: details ?? undefined,
        idempotencyKey: idempotencyKey ?? `ugcrpt_${subjectType}_${subjectId}_${Date.now()}`,
      }),
    },
  );
  return { reportId: response.reportId };
}
