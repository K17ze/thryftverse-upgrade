'use client';

/**
 * Poster story activity — port of the mobile PosterStoryActivityScreen.
 * Owner-only insights for a story: summary strip (viewers, reactions,
 * replies, completion), a peak-activity hour histogram, and a segmented
 * list (viewers / reactions / replies / style votes).
 *
 * Live mode reads GET /poster-stories/:id/activity (creator-scoped — the
 * wire 403s for anyone else) plus the story detail for frames and the
 * style-vote sticker definitions the vote rows label against. Fixture
 * mode keeps the deterministic seeded contract (posterActivityFor).
 */

import { BackBar } from '@/components/profile/BackBar';
import { usePosterActivityWorkflow } from '@/components/poster/activity/usePosterActivityWorkflow';
import { PosterActivityGates } from '@/components/poster/activity/PosterActivityGates';
import { PosterActivitySummary } from '@/components/poster/activity/PosterActivitySummary';
import { PosterActivityList } from '@/components/poster/activity/PosterActivityList';

export default function PosterStoryActivityPage() {
  const {
    router,
    user,
    isGuest,
    sessionLoading,
    isLive,
    isLoading,
    isError,
    refetch,
    story,
    forbidden,
    stats,
    hourly,
    peakHour,
    tab,
    setTab,
    tabs,
    sticker,
    activityPayload,
  } = usePosterActivityWorkflow();

  const gate = (
    <PosterActivityGates
      isLoading={isLoading}
      isLive={isLive}
      sessionLoading={sessionLoading}
      isError={isError}
      refetch={() => void refetch()}
      isGuest={isGuest}
      story={story}
      forbidden={forbidden}
      user={user}
      onNavigateAuth={() => router.push('/auth')}
    />
  );

  if (gate) return gate;
  if (!story || !stats) return null;

  return (
    <div className="mx-auto max-w-[720px] pb-16 lg:max-w-[1200px]">
      <BackBar />

      {/* Desktop two-pane — the summary/histogram rail stays pinned while
          the segmented activity list scrolls beside it (Linear/Robinhood
          insights grammar). Mobile keeps the single stacked column. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-10">
        <PosterActivitySummary
          story={story}
          stats={stats}
          hourly={hourly}
          peakHour={peakHour}
        />

        <PosterActivityList
          tabs={tabs}
          tab={tab}
          setTab={setTab}
          activity={activityPayload}
          story={story}
          sticker={sticker}
          isLive={isLive}
        />
      </div>
    </div>
  );
}
