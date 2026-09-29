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

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { BackBar } from '@/components/profile/BackBar';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import * as socialService from '@/lib/api/services/social';
import {
  archiveStoryById,
  type PosterArchiveStory,
} from '@/lib/data/fixtures-posters';
import {
  posterActivityFor,
  POSTER_REACTION_META,
  POSTER_STORY_STICKERS,
  type PosterReaction,
  type PosterStoryActivity,
} from '@/lib/data/fixtures-content';
import { useSession } from '@/lib/session/SessionProvider';
import { formatCount, timeAgo } from '@/lib/utils/format';

type ActivityTab = 'viewers' | 'reactions' | 'replies' | 'stickers';

const tick = (ms = 200) => new Promise((r) => setTimeout(r, ms));

interface StyleSticker {
  id: string;
  label: string;
  options: { id: string; label: string }[];
}

interface ActivityData {
  story: PosterArchiveStory | null;
  activity: PosterStoryActivity | null;
  /** Style-vote sticker defs the vote rows label against (fixture seeds or
   *  the story's own embedded sticker payloads in live mode). */
  stickers: StyleSticker[];
  /** Wire answered but the viewer isn't the creator. */
  forbidden: boolean;
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export default function PosterStoryActivityPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const id = String(params.id ?? '');
  const isLive = DATA_MODE === 'live';
  const [tab, setTab] = useState<ActivityTab>('viewers');

  const { data, isLoading, isError, refetch } = useQuery<ActivityData>({
    queryKey: ['poster-story-activity', id, DATA_MODE, user?.id ?? 'guest'],
    // The activity route resolves the actor from auth — no session means a
    // guaranteed 401, so the guest wall renders instead of fetching.
    enabled: !isLive || !!user,
    queryFn: async () => {
      if (!isLive) {
        await tick();
        const story = archiveStoryById(id) ?? null;
        return {
          story,
          activity: story ? posterActivityFor(story) : null,
          stickers: POSTER_STORY_STICKERS.filter((s) => s.storyId === id),
          forbidden: false,
        };
      }
      // Story detail stays readable for the owner past expiry — it carries
      // frames + stickers the activity rows reference. A 404 here means the
      // story doesn't exist or isn't visible to this viewer at all.
      const story = await socialService.fetchPosterStory(id);
      if (!story) {
        return { story: null, activity: null, stickers: [], forbidden: false };
      }
      try {
        const activity = await socialService.fetchPosterStoryActivity(id);
        return {
          story: socialService.mapPosterStoryToArchive(story),
          activity,
          stickers: socialService.posterStoryStyleStickers(story),
          forbidden: false,
        };
      } catch (e) {
        if (e instanceof ApiRequestError && (e.status === 403 || e.status === 401)) {
          return {
            story: socialService.mapPosterStoryToArchive(story),
            activity: null,
            stickers: [],
            forbidden: true,
          };
        }
        throw e;
      }
    },
  });

  const story = data?.story ?? null;
  const activity = data?.activity ?? null;
  const forbidden = data?.forbidden ?? false;

  const stats = useMemo(() => {
    if (!story) return null;
    const act = activity ?? {
      viewers: [] as PosterStoryActivity['viewers'],
      reactions: [] as PosterStoryActivity['reactions'],
      replies: [] as PosterStoryActivity['replies'],
      styleVotes: [] as PosterStoryActivity['styleVotes'],
    };
    const frames = Math.max(1, story.frames.length);
    const completed = act.viewers.filter(
      (v) => v.viewedFrameCount >= frames,
    ).length;
    const completion =
      act.viewers.length === 0
        ? 0
        : Math.round((completed / act.viewers.length) * 100);
    return {
      // The wire's uniqueViewerCount rides the archive projection; the
      // viewer list length is the fallback floor.
      viewers: story.viewCount || act.viewers.length,
      reactions: act.reactions.length,
      replies: act.replies.length,
      completion,
    };
  }, [story, activity]);

  // Hour-of-day histogram across viewers + engagements — the mobile
  // peak-time chart grammar (flat bars, peak hour accented).
  const hourly = useMemo(() => {
    const buckets = new Array(24).fill(0) as number[];
    if (!activity) return buckets;
    const add = (iso: string) => {
      const h = new Date(iso).getHours();
      if (!Number.isNaN(h)) buckets[h] += 1;
    };
    activity.viewers.forEach((v) => add(v.latestViewedAt));
    activity.reactions.forEach((r) => add(r.createdAt));
    activity.replies.forEach((r) => add(r.createdAt));
    activity.styleVotes.forEach((v) => add(v.createdAt));
    return buckets;
  }, [activity]);

  const peakHour = hourly.indexOf(Math.max(...hourly, 0));

  // Hold the skeleton while a stored live session resolves — owner state
  // is undecided until then, not guest.
  if (isLoading || (isLive && sessionLoading)) {
    return (
      <div className="mx-auto max-w-[720px] pb-16 lg:max-w-[1200px]" aria-busy aria-label="Loading story activity">
        <BackBar />
        <div className="px-4 pt-2 sm:px-6 lg:px-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 px-4 sm:px-6 lg:max-w-[400px] lg:grid-cols-2 lg:px-0">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <div className="mt-8 space-y-3 px-4 sm:px-6 lg:px-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-[38px] w-[38px] rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="warning"
          title="Could not load story activity"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </div>
    );
  }

  if (isLive && isGuest) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="lock"
          title="Sign in to view story insights"
          subtitle="Story activity is only visible on stories you published."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="analytics"
          title="No activity for this story"
          subtitle="Insights are recorded for stories in your archive."
          actionLabel="Back to archive"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  // Owner-only — activity is the publisher's analytics surface. Live mode
  // learns this from the wire (403); fixture keeps the local creator check.
  if (forbidden || story.creatorId !== (user?.id ?? 'me')) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="lock"
          title="Insights are owner-only"
          subtitle="Story activity is only visible on stories you published."
          actionLabel="Back"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  const stickers = data?.stickers ?? [];
  const sticker =
    stickers.find((s) => activity?.styleVotes.some((v) => v.stickerId === s.id)) ??
    stickers[0];
  const a = activity ?? {
    storyId: id,
    viewers: [],
    reactions: [],
    replies: [],
    styleVotes: [],
  };

  const tabs: { value: ActivityTab; label: string; count?: number }[] = [
    { value: 'viewers', label: 'Viewers', count: a.viewers.length },
    { value: 'reactions', label: 'Reactions', count: a.reactions.length },
    { value: 'replies', label: 'Replies', count: a.replies.length },
    ...(sticker
      ? [{ value: 'stickers' as const, label: 'Votes', count: a.styleVotes.length }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[720px] pb-16 lg:max-w-[1200px]">
      <BackBar />

      {/* Desktop two-pane — the summary/histogram rail stays pinned while
          the segmented activity list scrolls beside it (Linear/Robinhood
          insights grammar). Mobile keeps the single stacked column. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <header className="px-4 pt-2 sm:px-6 lg:px-0">
            <p className="text-meta font-semibold uppercase tracking-wide text-text-muted">
              {story.status === 'active' ? 'Live story' : 'Archived story'}
            </p>
            <h1 className="mt-1 text-screen-title text-text-primary">
              Story activity
            </h1>
            <p className="mt-1 text-meta text-text-muted">
              {story.frames.length} {story.frames.length === 1 ? 'frame' : 'frames'} ·{' '}
              {story.status === 'active'
                ? `expires ${timeAgo(story.expiresAt).replace(' ago', '')} from now`
                : `ended ${timeAgo(story.expiresAt)}`}
            </p>
          </header>

          {/* Summary strip — flat stat row, tabular numerals */}
          <dl className="mt-5 grid grid-cols-4 gap-2 px-4 sm:px-6 lg:grid-cols-2 lg:px-0">
            {[
              { label: 'Viewers', value: stats!.viewers },
              { label: 'Reactions', value: stats!.reactions },
              { label: 'Replies', value: stats!.replies },
              { label: 'Completion', value: `${stats!.completion}%`, raw: true },
            ].map((s) => (
              <div key={s.label} className="border-t border-border-subtle pt-2.5">
                <dd className="tnum text-section-title font-bold text-text-primary">
                  {s.raw ? s.value : formatCount(s.value as number)}
                </dd>
                <dt className="mt-0.5 text-meta text-text-muted">{s.label}</dt>
              </div>
            ))}
          </dl>

          {/* Peak activity — 24-hour histogram, peak bar accented */}
          <section aria-label="Peak activity times" className="mt-8 px-4 sm:px-6 lg:px-0">
            <h2 className="text-body-emphasis font-semibold text-text-primary">
              Peak times
            </h2>
            <div
              className="mt-3 flex h-16 items-end gap-[3px]"
              role="img"
              aria-label={`Engagement by hour — busiest around ${hourLabel(peakHour)}`}
            >
              {hourly.map((n, h) => {
                const max = Math.max(...hourly, 1);
                const height = Math.max(3, Math.round((n / max) * 60));
                return (
                  <span
                    key={h}
                    title={`${hourLabel(h)} — ${n} ${n === 1 ? 'event' : 'events'}`}
                    className={`flex-1 rounded-full ${
                      h === peakHour ? 'bg-antique-gold' : 'bg-surface-elevated'
                    }`}
                    style={{ height }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-micro text-text-muted">
              <span>12am</span>
              <span>6am</span>
              <span>12pm</span>
              <span>6pm</span>
            </div>
          </section>
        </div>

        {/* Activity lists */}
        <div>
          <div className="mt-7 px-4 sm:px-6 lg:mt-2 lg:px-0">
            <SegmentedControl options={tabs} value={tab} onChange={setTab} />
          </div>

          <ul className="mt-2 divide-y divide-border-subtle px-4 sm:px-6 lg:px-0" aria-live="polite">
        {tab === 'viewers' &&
          a.viewers.map((v) => (
            <li key={v.userId} className="flex items-center gap-3 py-3">
              <Avatar src={v.avatar} name={v.username ?? 'viewer'} size={38} />
              <div className="min-w-0 flex-1">
                <p className="clamp-1 text-body font-medium text-text-primary">
                  {v.username ? `@${v.username}` : 'Member'}
                </p>
                <p className="text-meta text-text-muted">
                  <span className="tnum">
                    Saw {v.viewedFrameCount} of {story.frames.length}{' '}
                    {story.frames.length === 1 ? 'frame' : 'frames'}
                  </span>
                </p>
              </div>
              <span className="tnum shrink-0 text-meta text-text-muted">
                {timeAgo(v.latestViewedAt)}
              </span>
            </li>
          ))}

        {tab === 'reactions' &&
          (a.reactions.length === 0 ? (
            <ListEmpty copy="No reactions yet — reactions show up here." />
          ) : (
            a.reactions.map((r, i) => {
              const meta = POSTER_REACTION_META[r.reaction as PosterReaction];
              const frameIndex = story.frames.findIndex((f) => f.id === r.frameId);
              return (
                <li key={`${r.userId}-${i}`} className="flex items-center gap-3 py-3">
                  <Avatar src={r.avatar} name={r.username ?? 'viewer'} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body font-medium text-text-primary">
                      {r.username ? `@${r.username}` : 'Member'}
                    </p>
                    <p className="text-meta text-text-muted">
                      Reacted {meta?.label ?? r.reaction}
                      {frameIndex >= 0 && story.frames.length > 1
                        ? ` · frame ${frameIndex + 1}`
                        : ''}
                    </p>
                  </div>
                  {meta ? (
                    <Icon name={meta.icon} size={18} className="shrink-0 text-warning-text" />
                  ) : null}
                  <span className="tnum shrink-0 text-meta text-text-muted">
                    {timeAgo(r.createdAt)}
                  </span>
                </li>
              );
            })
          ))}

        {tab === 'replies' &&
          (a.replies.length === 0 ? (
            <ListEmpty copy="No replies yet — replies land in your inbox too." />
          ) : (
            a.replies.map((r) => {
              const frameIndex = story.frames.findIndex((f) => f.id === r.frameId);
              return (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  <Avatar src={r.authorAvatar} name={r.authorUsername ?? 'viewer'} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body font-medium text-text-primary">
                      {r.authorUsername ? `@${r.authorUsername}` : 'Member'}
                      <span className="tnum font-normal text-text-muted">
                        {' '}· {timeAgo(r.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-body text-text-secondary">{r.body}</p>
                    {frameIndex >= 0 && story.frames.length > 1 ? (
                      <p className="mt-0.5 text-meta text-text-muted">
                        On frame {frameIndex + 1}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })
          ))}

        {tab === 'stickers' &&
          sticker &&
          (a.styleVotes.length === 0 ? (
            <ListEmpty copy={`No votes on “${sticker.label}” yet.`} />
          ) : (
            <>
              <li className="py-3">
                <p className="text-body font-medium text-text-primary">{sticker.label}</p>
                <ul className="mt-2 space-y-1.5">
                  {sticker.options.map((opt) => {
                    const votes = a.styleVotes.filter((v) => v.optionId === opt.id).length;
                    const pct = Math.round((votes / a.styleVotes.length) * 100);
                    return (
                      <li key={opt.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between text-meta text-text-secondary">
                            <span>{opt.label}</span>
                            <span className="tnum">{pct}%</span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-alt">
                            <span
                              className="block h-full rounded-full bg-brand"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
              {a.styleVotes.slice(0, 20).map((v, i) => (
                <li key={`${v.userId}-${i}`} className="flex items-center gap-3 py-2.5">
                  <Avatar src={null} name={v.username ?? 'viewer'} size={30} />
                  <p className="min-w-0 flex-1 text-meta text-text-secondary">
                    <span className="font-medium text-text-primary">
                      {v.username ? `@${v.username}` : 'Member'}
                    </span>{' '}
                    voted{' '}
                    <span className="font-medium">
                      {sticker.options.find((o) => o.id === v.optionId)?.label ?? v.optionId}
                    </span>
                  </p>
                  <span className="tnum shrink-0 text-meta text-text-muted">
                    {timeAgo(v.createdAt)}
                  </span>
                </li>
              ))}
            </>
          ))}
      </ul>

          {!isLive ? (
            <p className="mt-6 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6 lg:px-0">
              <Icon name="info" size={14} className="shrink-0" />
              Fixture dataset — a deterministic demo contract standing in for the
              live activity endpoint.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ListEmpty({ copy }: { copy: string }) {
  return <li className="py-8 text-center text-body text-text-muted">{copy}</li>;
}
