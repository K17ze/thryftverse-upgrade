'use client';

/**
 * Poster viewer — immersive media stage, web port of PosterViewerScreen.
 * Progress segments top, author row beneath (links to the creator's
 * profile), caption + lifecycle meta on the bottom scrim, shoppable
 * product hotspots pinned to the frame. Tap right/left to step frames —
 * press-and-hold pauses, arrow keys navigate, Escape closes.
 *
 * Resolves two sources: feed posters (POSTERS + POSTER_SLIDES) and the
 * member's own archive stories (fixtures-posters), so archive cards open
 * in the same chrome. Own stories get the mobile options-sheet owner
 * actions — archive + delete — persisted in the posterArchive store.
 */

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { POSTERS, STORY_RAIL, USERS, userById } from '@/lib/data/fixtures';
import { POSTER_SLIDES } from '@/lib/data/fixtures-media';
import {
  archiveStoryById,
  posterTagsFor,
  type PosterArchiveStory,
} from '@/lib/data/fixtures-posters';
import { usePosterArchive } from '@/lib/store/posterArchive';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { timeAgo } from '@/lib/utils/format';

const FRAME_MS = 6000;
const HOLD_MS = 180;
const tick = (ms = 240) => new Promise((r) => setTimeout(r, ms));

interface PosterView {
  id: string;
  authorId: string;
  slides: string[];
  /** Per-frame captions for archive stories; feed posters use `caption`. */
  frameCaptions: (string | undefined)[];
  caption?: string | null;
  createdAt?: string;
  /** Set when the id resolves to one of the member's archive stories. */
  story?: PosterArchiveStory;
}

function usePoster(id: string) {
  return useQuery<PosterView | null>({
    queryKey: ['poster', id],
    queryFn: async () => {
      await tick();
      const poster = POSTERS.find((p) => p.id === id);
      if (poster) {
        const slides = POSTER_SLIDES[id] ?? [poster.coverUri];
        return {
          id: poster.id,
          authorId: poster.authorId,
          slides,
          frameCaptions: slides.map(() => undefined),
          caption: poster.caption,
          createdAt: poster.createdAt,
        };
      }
      const story = archiveStoryById(id);
      if (story) {
        return {
          id: story.id,
          authorId: story.creatorId,
          slides: story.frames.map((f) => f.mediaUrl),
          frameCaptions: story.frames.map((f) => f.caption),
          createdAt: story.createdAt,
          story,
        };
      }
      // Story-rail entries (s*) resolve to a single-frame poster keyed by
      // the rail cover — keeps every rail avatar openable in fixture mode.
      const rail = STORY_RAIL.find((s) => s.id === id);
      if (rail) {
        const railAuthor = USERS.find((u) => u.username === rail.username);
        return {
          id: rail.id,
          authorId: railAuthor?.id ?? 'me',
          slides: [rail.coverUri],
          frameCaptions: [undefined],
        };
      }
      return null;
    },
  });
}

export default function PosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { show } = useToast();
  const { user: me } = useSession();
  const hydrated = useHydrated();
  const { data, isLoading } = usePoster(id);

  const [frame, setFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);
  const suppressClick = useRef(false);

  // Persisted archive mutations — owner menu actions write here.
  const removedStoryIds = usePosterArchive((s) => s.removedStoryIds);
  const archivedStoryIds = usePosterArchive((s) => s.archivedStoryIds);
  const archiveStory = usePosterArchive((s) => s.archiveStory);
  const removeStory = usePosterArchive((s) => s.removeStory);

  const slides = data?.slides ?? [];
  const frameCount = slides.length;
  const tags = posterTagsFor(id).filter(
    (t) => (t.frameIndex ?? 0) === frame,
  );

  const isOwn = !!data?.story && !!me && data.authorId === me.id;
  const storyStatus: 'active' | 'archived' | undefined = data?.story
    ? hydrated && archivedStoryIds.includes(data.story.id)
      ? 'archived'
      : data.story.status
    : undefined;

  const next = useCallback(() => {
    setProgress(0);
    setFrame((f) => Math.min(f + 1, frameCount - 1));
  }, [frameCount]);

  const prev = useCallback(() => {
    setProgress(0);
    setFrame((f) => Math.max(f - 1, 0));
  }, []);

  // Auto-advance; halts on the final frame and while press-held.
  useEffect(() => {
    if (frameCount <= 1 || frame >= frameCount - 1 || paused) return;
    const started = Date.now() - progress * FRAME_MS;
    const interval = setInterval(() => {
      const p = (Date.now() - started) / FRAME_MS;
      if (p >= 1) {
        clearInterval(interval);
        next();
      } else {
        setProgress(p);
      }
    }, 50);
    return () => clearInterval(interval);
    // progress intentionally excluded — restarting on resume carries it over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, frameCount, paused, next]);

  // Keyboard parity — arrows step frames, Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') router.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, router]);

  // Press-and-hold pauses auto-advance; a released hold must not also
  // count as a tap, so the following click is swallowed.
  const onZoneDown = () => {
    heldRef.current = false;
    suppressClick.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      setPaused(true);
    }, HOLD_MS);
  };
  const onZoneRelease = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (heldRef.current) {
      heldRef.current = false;
      suppressClick.current = true;
      setPaused(false);
    }
  };
  const onZoneClick = (advance: () => void) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    advance();
  };

  if (isLoading) {
    return (
      <div
        className="flex h-[calc(100dvh-4rem-76px)] items-center justify-center md:h-[calc(100dvh-4rem)]"
        aria-busy
        aria-label="Loading poster"
      >
        <Skeleton className="h-full w-full max-w-[560px]" />
      </div>
    );
  }

  // Deleted archive stories stay deleted on direct URL visits too.
  const isRemoved =
    hydrated && !!data?.story && removedStoryIds.includes(data.id);

  if (!data || isRemoved) {
    return (
      <EmptyState
        icon="image"
        title="Poster unavailable"
        subtitle="This poster has expired or been removed."
        actionLabel="Back to feed"
        onAction={() => router.push('/')}
      />
    );
  }

  const author = userById(data.authorId);
  const authorHref = data.authorId === 'me' ? '/profile' : `/u/${author?.username ?? ''}`;
  const caption = data.frameCaptions[frame] ?? data.caption;
  const expiresAt = data.story ? new Date(data.story.expiresAt).getTime() : 0;
  const hoursLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 3600e3));

  const copyLink = async () => {
    const url = `${window.location.origin}/poster/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      show('Link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  const askDelete = () =>
    setConfirm({
      title: 'Delete story?',
      message: 'This will permanently remove your poster story.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => {
        removeStory(id);
        setConfirm(null);
        show('Story deleted', 'info');
        router.back();
      },
    });

  const archiveNow = () => {
    archiveStory(id);
    setOptionsOpen(false);
    show('Story archived', 'info');
  };

  return (
    <div className="relative flex h-[calc(100dvh-4rem-76px)] justify-center overflow-hidden bg-black md:h-[calc(100dvh-4rem)]">
      <div className="relative h-full w-full max-w-[560px]">
        {/* Stage */}
        <AppImage
          key={slides[frame]}
          src={slides[frame]}
          alt={caption ?? `Poster by @${author?.username ?? 'author'}`}
          fill
          priority
          className="h-full w-full"
          imgClassName="object-cover"
          sizes="(max-width: 560px) 100vw, 560px"
        />

        {/* Tap zones — invisible navigation; press-and-hold pauses */}
        {frameCount > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous frame"
              onPointerDown={onZoneDown}
              onPointerUp={onZoneRelease}
              onPointerLeave={onZoneRelease}
              onClick={() => onZoneClick(prev)}
              className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
            />
            <button
              type="button"
              aria-label="Next frame"
              onPointerDown={onZoneDown}
              onPointerUp={onZoneRelease}
              onPointerLeave={onZoneRelease}
              onClick={() => onZoneClick(next)}
              className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize"
            />
          </>
        ) : null}

        {/* Shoppable hotspots — product tags pinned to the frame */}
        {tags.map((tag) => (
          <Link
            key={tag.id}
            href={`/item/${tag.listingId}`}
            className="group absolute z-10"
            style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
            aria-label={`Shop ${tag.label}`}
          >
            <span className="block -translate-x-1/2 -translate-y-1/2 p-3">
              <span className="block h-3 w-3 rounded-full bg-brand ring-2 ring-white/80 transition-transform group-hover:scale-110" />
            </span>
            <span className="absolute left-1/2 top-4 block -translate-x-1/2 whitespace-nowrap rounded-full bg-overlay px-2.5 py-1 text-micro font-semibold text-scrim-text-primary">
              {tag.label}
            </span>
          </Link>
        ))}

        {paused ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay px-3 py-1.5 text-meta font-medium text-scrim-text-secondary">
              <Icon name="pause" size={14} />
              Paused
            </span>
          </div>
        ) : null}

        {/* Top chrome — progress segments + author row */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 via-black/25 to-transparent px-3 pb-10 pt-3">
          {frameCount > 1 ? (
            <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={frameCount} aria-valuenow={frame + 1} aria-label={`Frame ${frame + 1} of ${frameCount}`}>
              {slides.map((_, i) => (
                <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                  <span
                    className="block h-full rounded-full bg-white"
                    style={{
                      width:
                        i < frame
                          ? '100%'
                          : i === frame
                            ? frame === frameCount - 1
                              ? '100%'
                              : `${Math.min(progress * 100, 100)}%`
                            : '0%',
                    }}
                  />
                </span>
              ))}
            </div>
          ) : null}

          <div className="pointer-events-auto mt-3 flex items-center gap-2.5">
            <Link
              href={authorHref}
              className="pressable flex min-w-0 flex-1 items-center gap-2.5 rounded-md"
              aria-label={`Open @${author?.username ?? 'author'} profile`}
            >
              <Avatar src={author?.avatar} name={author?.username} size={32} ring />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-body font-semibold text-scrim-text-primary">
                  <span className="clamp-1">@{author?.username ?? 'author'}</span>
                  {author?.isVerified ? (
                    <Icon name="verified" size={13} className="shrink-0 text-scrim-text-primary" filled />
                  ) : null}
                </span>
                {data.createdAt ? (
                  <span className="block text-meta text-scrim-text-secondary">
                    {timeAgo(data.createdAt)}
                  </span>
                ) : null}
              </span>
            </Link>
            <IconButton name="share" aria-label="Copy poster link" onMedia onClick={copyLink} />
            {isOwn ? (
              <IconButton
                name="more"
                aria-label="Story options"
                onMedia
                onClick={() => setOptionsOpen(true)}
              />
            ) : null}
            <IconButton name="close" aria-label="Close poster" onMedia onClick={() => router.back()} />
          </div>
        </div>

        {/* Caption + lifecycle meta — bottom scrim */}
        {caption || data.story ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-6 pt-14">
            {caption ? (
              <p className="text-body-large font-medium text-scrim-text-primary">{caption}</p>
            ) : null}
            {data.story ? (
              <p className="mt-1.5 text-meta text-scrim-text-secondary">
                {storyStatus === 'active' ? (
                  <span className="tnum">{hoursLeft}h left</span>
                ) : (
                  'Archived'
                )}
                {frameCount > 1 ? (
                  <span className="tnum"> · {frame + 1} / {frameCount}</span>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Owner options — mirrors PosterOptionsMenu (owner tier) */}
      <Sheet open={optionsOpen} onClose={() => setOptionsOpen(false)} title="Story options" maxWidth={440}>
        <div className="px-5 pb-6 pt-1">
          <button
            type="button"
            onClick={() => {
              setOptionsOpen(false);
              void copyLink();
            }}
            className="pressable flex w-full items-center gap-3 rounded-md py-3 text-left text-body-emphasis text-text-primary"
          >
            <Icon name="link" size={20} />
            Copy link
          </button>
          {storyStatus === 'active' ? (
            <button
              type="button"
              onClick={archiveNow}
              className="pressable flex w-full items-center gap-3 rounded-md py-3 text-left text-body-emphasis text-text-primary"
            >
              <Icon name="inventory" size={20} />
              Archive story
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setOptionsOpen(false);
              askDelete();
            }}
            className="pressable flex w-full items-center gap-3 rounded-md py-3 text-left text-body-emphasis text-danger-text"
          >
            <Icon name="trash" size={20} />
            Delete story
          </button>
        </div>
      </Sheet>

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </div>
  );
}
