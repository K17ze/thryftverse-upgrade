'use client';

/**
 * Creator analytics queries — the /creator-analytics data path.
 *
 * Live-backend only: the v2 pipeline (events → daily aggregate →
 * summary/timeline/ranking/earnings) has no fixture dataset, so the
 * queries arm only when DATA_MODE === 'live' and a real session user
 * exists — the demo build and guests never hit the authed endpoints.
 *
 * Summary is the critical read (the page treats its failure as fatal);
 * timeline, ranking and earnings are supplementary — each may fail on
 * its own and degrade to the page's partial-error banner, matching the
 * mobile useCreatorAnalyticsDashboard contract.
 *
 * `placeholderData: keepPreviousData` keeps the previous period's reads
 * mounted while a new period resolves — the page labels that window
 * ("previous period · updating") instead of flashing a skeleton, same
 * grammar as native's isStalePeriodData.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import * as creatorAnalyticsService from '@/lib/api/services/creatorAnalytics';
import type { AnalyticsPeriod } from '@/lib/api/services/creatorAnalytics';
import { useSession } from '@/lib/session/SessionProvider';

export type { AnalyticsPeriod };

export const creatorAnalyticsKeys = {
  summary: (period: AnalyticsPeriod, userId?: string | null) =>
    ['creator-analytics', 'summary', period, userId ?? 'guest'] as const,
  timeline: (period: AnalyticsPeriod, userId?: string | null) =>
    ['creator-analytics', 'timeline', period, userId ?? 'guest'] as const,
  ranking: (period: AnalyticsPeriod, userId?: string | null) =>
    ['creator-analytics', 'ranking', period, userId ?? 'guest'] as const,
  earnings: (userId?: string | null) =>
    ['creator-analytics', 'earnings', userId ?? 'guest'] as const,
};

function useArmed(userId: string | undefined, isGuest: boolean): boolean {
  return DATA_MODE === 'live' && !!userId && !isGuest;
}

export function useCreatorAnalyticsSummary(period: AnalyticsPeriod) {
  const { user, isGuest } = useSession();
  return useQuery({
    queryKey: creatorAnalyticsKeys.summary(period, user?.id),
    enabled: useArmed(user?.id, isGuest),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      creatorAnalyticsService.fetchAnalyticsSummary({ period }, signal),
  });
}

export function useCreatorAnalyticsTimeline(period: AnalyticsPeriod) {
  const { user, isGuest } = useSession();
  return useQuery({
    queryKey: creatorAnalyticsKeys.timeline(period, user?.id),
    enabled: useArmed(user?.id, isGuest),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      creatorAnalyticsService.fetchAnalyticsTimeline({ period }, signal),
  });
}

export function useCreatorContentRanking(period: AnalyticsPeriod, limit = 10) {
  const { user, isGuest } = useSession();
  return useQuery({
    queryKey: creatorAnalyticsKeys.ranking(period, user?.id),
    enabled: useArmed(user?.id, isGuest),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      creatorAnalyticsService.fetchContentRanking({ period, limit }, signal),
  });
}

/** Earnings are period-independent — the ledger projection stands alone. */
export function useCreatorEarnings() {
  const { user, isGuest } = useSession();
  return useQuery({
    queryKey: creatorAnalyticsKeys.earnings(user?.id),
    enabled: useArmed(user?.id, isGuest),
    queryFn: ({ signal }) => creatorAnalyticsService.fetchEarningsSummary(signal),
  });
}

/**
 * Manual payout — POST /creator/analytics/earnings/payout (destination
 * 'wallet', the same rail mobile's useCreatorPayout drives). The
 * idempotency key persists across a user's retries until a confirmed
 * success: a lost response replays server-side by (userId, key), so a
 * fresh key per attempt could double-pay. Success refreshes the earnings
 * projection so the ledger reflects the hold.
 */
export function useCreatorAnalyticsPayout() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const payoutKeyRef = useRef<string | null>(null);
  return useMutation({
    mutationFn: async () => {
      if (!payoutKeyRef.current) {
        payoutKeyRef.current = `manual_${Date.now()}`;
      }
      const res = await creatorAnalyticsService.requestPayout(
        'wallet',
        payoutKeyRef.current,
      );
      payoutKeyRef.current = null;
      return res;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: creatorAnalyticsKeys.earnings(user?.id),
      });
    },
  });
}
