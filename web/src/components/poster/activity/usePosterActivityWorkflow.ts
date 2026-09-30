import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import * as socialService from '@/lib/api/services/social';
import { archiveStoryById } from '@/lib/data/fixtures-posters';
import {
  posterActivityFor,
  POSTER_STORY_STICKERS,
  type PosterStoryActivity,
} from '@/lib/data/fixtures-content';
import { useSession } from '@/lib/session/SessionProvider';
import {
  type ActivityData,
  type ActivityTab,
  tick,
} from './PosterActivityPrimitives';

export function usePosterActivityWorkflow() {
  const params = useParams();
  const router = useRouter();
  const { user, isGuest, sessionLoading } = useSession();
  const id = String(params.id ?? '');
  const isLive = DATA_MODE === 'live';
  const [tab, setTab] = useState<ActivityTab>('viewers');

  const { data, isLoading, isError, refetch } = useQuery<ActivityData>({
    queryKey: ['poster-story-activity', id, DATA_MODE, user?.id ?? 'guest'],
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
      viewers: story.viewCount || act.viewers.length,
      reactions: act.reactions.length,
      replies: act.replies.length,
      completion,
    };
  }, [story, activity]);

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

  return {
    router,
    user,
    isGuest,
    sessionLoading,
    isLive,
    isLoading,
    isError,
    refetch,
    story,
    activity,
    forbidden,
    stats,
    hourly,
    peakHour,
    tab,
    setTab,
    tabs,
    stickers,
    sticker,
    activityPayload: a,
  };
}
