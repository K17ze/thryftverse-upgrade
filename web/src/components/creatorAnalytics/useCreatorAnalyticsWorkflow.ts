'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import type { AnalyticsPeriod } from '@/lib/api/services/creatorAnalytics';
import {
  useCreatorAnalyticsPayout,
  useCreatorAnalyticsSummary,
  useCreatorAnalyticsTimeline,
  useCreatorContentRanking,
  useCreatorEarnings,
} from '@/lib/hooks/creator-analytics-queries';
import { useOnlineStatus } from '@/lib/offline';
import { useSession } from '@/lib/session/SessionProvider';

export function useCreatorAnalyticsWorkflow() {
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const { isOffline } = useOnlineStatus();
  const { show: showToast } = useToast();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');

  const summaryQuery = useCreatorAnalyticsSummary(period);
  const timelineQuery = useCreatorAnalyticsTimeline(period);
  const rankingQuery = useCreatorContentRanking(period);
  const earningsQuery = useCreatorEarnings();
  const payout = useCreatorAnalyticsPayout();

  const liveUnavailable = DATA_MODE !== 'live';
  const needsSignIn = !user || isGuest;
  const armed = !liveUnavailable && !needsSignIn;

  const summary = armed ? summaryQuery.data : undefined;
  const timeline = armed ? timelineQuery.data : undefined;
  const ranking = armed ? rankingQuery.data : undefined;
  const earnings = armed ? earningsQuery.data : undefined;

  const isEmpty = summary
    ? summary.completeness !== 'unavailable' &&
      summary.summary.views.value === 0 &&
      summary.summary.likes.value === 0 &&
      summary.summary.saves.value === 0 &&
      summary.summary.comments.value === 0 &&
      summary.summary.shares.value === 0 &&
      summary.summary.productClicks.value === 0
    : false;

  const partialError =
    armed &&
    !summaryQuery.isLoading &&
    (timelineQuery.isError ||
      rankingQuery.isError ||
      earningsQuery.isError ||
      (summaryQuery.isError && !!summary));

  const stalePeriod =
    (summaryQuery.isPlaceholderData && summaryQuery.isFetching) ||
    (timelineQuery.isPlaceholderData && timelineQuery.isFetching) ||
    (rankingQuery.isPlaceholderData && rankingQuery.isFetching);

  const heroThumbnail = ranking?.items[0]?.thumbnailUrl ?? null;

  const onPayout = () => {
    payout.mutate(undefined, {
      onSuccess: () => showToast('Payout requested', 'success'),
      onError: (err) =>
        showToast(parseApiError(err, 'Payout failed. Please try again.').message, 'error'),
    });
  };

  return {
    router,
    user,
    sessionLoading,
    isOffline,
    period,
    setPeriod,
    summaryQuery,
    timelineQuery,
    rankingQuery,
    earningsQuery,
    payout,
    liveUnavailable,
    needsSignIn,
    armed,
    summary,
    timeline,
    ranking,
    earnings,
    isEmpty,
    partialError,
    stalePeriod,
    heroThumbnail,
    onPayout,
  };
}
