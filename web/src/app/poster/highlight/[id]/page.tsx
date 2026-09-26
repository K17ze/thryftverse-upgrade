'use client';

/**
 * Highlight viewer — web port of PosterHighlightViewerScreen. Same stage
 * grammar as the poster viewer minus the author row: centered title under
 * the top scrim, progress segments, tap zones, press-and-hold pause,
 * bottom caption + frame counter. Auto-advance stops on the last frame —
 * closing is always manual.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  POSTER_HIGHLIGHTS,
  type PosterHighlight,
} from '@/lib/data/fixtures-posters';
import { usePosterArchive } from '@/lib/store/posterArchive';
import { useHydrated } from '@/lib/store/useStore';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const FRAME_MS = 5000;
const HOLD_MS = 180;
const tick = (ms = 240) => new Promise((r) => setTimeout(r, ms));

export default function PosterHighlightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const createdHighlights = usePosterArchive((s) => s.highlights);

  const { data: highlight, isLoading } = useQuery<PosterHighlight | null>({
    queryKey: ['poster-highlight', id, hydrated],
    queryFn: async () => {
      await tick();
      const all = hydrated
        ? [...createdHighlights, ...POSTER_HIGHLIGHTS]
        : POSTER_HIGHLIGHTS;
      return all.find((h) => h.id === id) ?? null;
    },
  });

  const [frame, setFrame] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);
  const suppressClick = useRef(false);

  const frames = useMemo(() => highlight?.frames ?? [], [highlight]);
  const frameCount = frames.length;
  const isLast = frame >= frameCount - 1;

  const next = useCallback(() => {
    setProgress(0);
    setFrame((f) => Math.min(f + 1, frameCount - 1));
  }, [frameCount]);

  const prev = useCallback(() => {
    setProgress(0);
    setFrame((f) => Math.max(f - 1, 0));
  }, []);

  // Auto-advance — halts on the final frame, pauses while held.
  useEffect(() => {
    if (frameCount <= 1 || isLast || paused) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, frameCount, isLast, paused, next]);

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

  // Press-and-hold pauses — mirrors the mobile long-press. The tap still
  // resolves through click so keyboard activation works; a released hold
  // suppresses that click instead of advancing.
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
        aria-label="Loading highlight"
      >
        <Skeleton className="h-full w-full max-w-[560px]" />
      </div>
    );
  }

  if (!highlight || frames.length === 0) {
    return (
      <EmptyState
        icon="bookmark"
        title="Highlight unavailable"
        subtitle="This highlight may have been removed."
        actionLabel="Back to archive"
        onAction={() => router.push('/poster/archive')}
      />
    );
  }

  const active = frames[Math.min(frame, frameCount - 1)];
  const isSingle = frameCount <= 1;

  return (
    <div className="relative flex h-[calc(100dvh-4rem-76px)] justify-center overflow-hidden bg-black md:h-[calc(100dvh-4rem)]">
      <div className="relative h-full w-full max-w-[560px]">
        <AppImage
          key={active.frameId}
          src={active.mediaUrl}
          alt={active.caption ?? highlight.title}
          fill
          priority
          className="h-full w-full"
          imgClassName="object-cover"
          sizes="(max-width: 560px) 100vw, 560px"
        />

        {/* Tap zones — prev/third, next/two-thirds; hold pauses */}
        {!isSingle ? (
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

        {paused ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay px-3 py-1.5 text-meta font-medium text-scrim-text-secondary">
              <Icon name="pause" size={14} />
              Paused
            </span>
          </div>
        ) : null}

        {/* Top chrome — title row, then segments */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 via-black/25 to-transparent px-3 pb-10 pt-3">
          <div className="pointer-events-auto flex items-center">
            <IconButton
              name="close"
              aria-label="Close highlight"
              onMedia
              onClick={() => router.back()}
            />
            <h1 className="clamp-1 flex-1 pr-11 text-center text-body-emphasis font-semibold text-scrim-text-primary">
              {highlight.title}
            </h1>
          </div>

          {!isSingle ? (
            <div
              className="mt-2 flex gap-1.5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={frameCount}
              aria-valuenow={frame + 1}
              aria-label={`Frame ${frame + 1} of ${frameCount}`}
            >
              {frames.map((f, i) => (
                <span
                  key={f.frameId}
                  className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
                >
                  <span
                    className="block h-full rounded-full bg-white"
                    style={{
                      width:
                        i < frame
                          ? '100%'
                          : i === frame
                            ? isLast
                              ? '100%'
                              : `${Math.min(progress * 100, 100)}%`
                            : '0%',
                    }}
                  />
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Caption + frame counter — bottom scrim */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-5 pt-14">
          {active.caption ? (
            <p className="clamp-2 text-body-large font-medium text-scrim-text-primary">
              {active.caption}
            </p>
          ) : null}
          {!isSingle ? (
            <p className="tnum mt-1.5 text-meta text-scrim-text-secondary">
              {frame + 1} / {frameCount}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
