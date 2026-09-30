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
 * actions — archive + delete — which write the poster-stories endpoints
 * in live mode and the posterArchive session store in fixture mode.
 */

import { useParams } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePosterWorkflow } from '@/components/poster/viewer/usePosterWorkflow';
import { PosterTopChrome } from '@/components/poster/viewer/PosterTopChrome';
import { PosterBottomScrim } from '@/components/poster/viewer/PosterBottomScrim';
import { PosterHotspots } from '@/components/poster/viewer/PosterHotspots';
import { PosterOptionsSheet } from '@/components/poster/viewer/PosterOptionsSheet';

export function PosterClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const w = usePosterWorkflow(id);

  if (w.isLoading) {
    return (
      <div
        className="flex h-[calc(100dvh-4rem-76px)] items-center justify-center md:h-[calc(100dvh-4rem)]"
        aria-busy
        aria-label="Loading poster"
      >
        <Skeleton className="h-full w-full max-w-[560px] lg:max-w-[640px]" />
      </div>
    );
  }

  if (!w.data || w.isRemoved) {
    return (
      <EmptyState
        icon="image"
        title="Poster unavailable"
        subtitle="This poster has expired or been removed."
        actionLabel="Back to feed"
        onAction={() => w.router.push('/')}
      />
    );
  }

  return (
    <div className="relative flex h-[calc(100dvh-4rem-76px)] justify-center overflow-hidden bg-black md:h-[calc(100dvh-4rem)]">
      {/* Desktop frame arrows */}
      {w.frameCount > 1 && w.frame > 0 ? (
        <button
          type="button"
          onClick={w.prev}
          aria-label="Previous frame"
          className="pressable absolute left-5 top-1/2 z-elevated hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-overlay text-scrim-text-primary transition-opacity hover:opacity-80 lg:flex"
        >
          <Icon name="back" size={20} />
        </button>
      ) : null}
      {w.frameCount > 1 && w.frame < w.frameCount - 1 ? (
        <button
          type="button"
          onClick={w.next}
          aria-label="Next frame"
          className="pressable absolute right-5 top-1/2 z-elevated hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-overlay text-scrim-text-primary transition-opacity hover:opacity-80 lg:flex"
        >
          <Icon name="forward" size={20} />
        </button>
      ) : null}

      <div className="relative h-full w-full max-w-[560px] lg:max-w-[640px]">
        {/* Stage */}
        <AppImage
          key={w.slides[w.frame]}
          src={w.slides[w.frame]}
          alt={w.caption ?? `Poster by @${w.authorUsername ?? 'author'}`}
          fill
          priority
          className="h-full w-full"
          imgClassName="object-cover"
          sizes="(max-width: 560px) 100vw, 560px"
        />

        {/* Tap zones — invisible navigation; press-and-hold pauses */}
        {w.frameCount > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous frame"
              onPointerDown={w.onZoneDown}
              onPointerUp={w.onZoneRelease}
              onPointerLeave={w.onZoneRelease}
              onClick={() => w.onZoneClick(w.prev)}
              className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
            />
            <button
              type="button"
              aria-label="Next frame"
              onPointerDown={w.onZoneDown}
              onPointerUp={w.onZoneRelease}
              onPointerLeave={w.onZoneRelease}
              onClick={() => w.onZoneClick(w.next)}
              className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize"
            />
          </>
        ) : null}

        {/* Shoppable hotspots */}
        <PosterHotspots tags={w.tags} />

        {w.paused ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay px-3 py-1.5 text-meta font-medium text-scrim-text-secondary">
              <Icon name="pause" size={14} />
              Paused
            </span>
          </div>
        ) : null}

        {/* Top chrome */}
        <PosterTopChrome
          slides={w.slides}
          frameCount={w.frameCount}
          frame={w.frame}
          progress={w.progress}
          author={w.author}
          authorUsername={w.authorUsername}
          authorHref={w.authorHref}
          createdAt={w.data.createdAt}
          isOwn={w.isOwn}
          onShare={w.sharePoster}
          onOpenOptions={() => w.setOptionsOpen(true)}
          onClose={() => w.router.back()}
        />

        {/* Bottom Scrim */}
        <PosterBottomScrim
          caption={w.caption}
          story={w.data.story}
          storyStatus={w.storyStatus}
          hoursLeft={w.hoursLeft}
          frame={w.frame}
          frameCount={w.frameCount}
          canReply={w.canReply}
          authorUsername={w.authorUsername}
          replyDraft={w.replyDraft}
          onReplyDraftChange={w.setReplyDraft}
          sendingReply={w.sendingReply}
          onSendReply={() => void w.sendReply()}
        />
      </div>

      <PosterOptionsSheet
        id={id}
        open={w.optionsOpen}
        onClose={() => w.setOptionsOpen(false)}
        storyStatus={w.storyStatus}
        onCopyLink={w.copyLink}
        onArchive={w.archiveNow}
        onDeleteRequest={w.askDelete}
        confirm={w.confirm}
        onDismissConfirm={() => w.setConfirm(null)}
      />

      {w.wall}
    </div>
  );
}
