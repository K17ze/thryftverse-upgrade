'use client';

/**
 * CreateHighlightSheet — web port of CreatePosterHighlightScreen. Pick
 * frames from your own stories, name the highlight, choose a cover from
 * the picks (first pick is the default — the mobile cover-selector strip
 * mirrors below the name field once two or more frames are picked).
 * Persists through the posterArchive store; lives next to the archive
 * since that is where the source frames live.
 */

import { useEffect, useMemo, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import {
  usePosterArchive,
} from '@/lib/store/posterArchive';
import type {
  PosterArchiveStory,
  PosterHighlight,
} from '@/lib/data/fixtures-posters';

const MAX_TITLE = 40;

interface PickableFrame {
  key: string;
  frameId: string;
  mediaUrl: string;
  caption?: string;
}

interface CreateHighlightSheetProps {
  open: boolean;
  onClose: () => void;
  /** Effective archive stories (active + archived, deletions removed). */
  stories: PosterArchiveStory[];
  onCreated: (highlight: PosterHighlight) => void;
}

export function CreateHighlightSheet({
  open,
  onClose,
  stories,
  onCreated,
}: CreateHighlightSheetProps) {
  const { show } = useToast();
  const createHighlight = usePosterArchive((s) => s.createHighlight);

  const [title, setTitle] = useState('');
  /** Picked frames in pick order — key → frame. */
  const [picked, setPicked] = useState<Map<string, PickableFrame>>(new Map());
  const [coverKey, setCoverKey] = useState<string | null>(null);

  // Fresh draft each time the sheet opens.
  useEffect(() => {
    if (open) {
      setTitle('');
      setPicked(new Map());
      setCoverKey(null);
    }
  }, [open]);

  const frames = useMemo<PickableFrame[]>(
    () =>
      stories.flatMap((s) =>
        s.frames.map((f) => ({
          key: `${s.id}:${f.id}`,
          frameId: f.id,
          mediaUrl: f.mediaUrl,
          caption: f.caption,
        })),
      ),
    [stories],
  );

  const pickedList = useMemo(() => [...picked.values()], [picked]);

  const toggle = (frame: PickableFrame) => {
    const wasPicked = picked.has(frame.key);
    setPicked((prev) => {
      const next = new Map(prev);
      if (wasPicked) next.delete(frame.key);
      else next.set(frame.key, frame);
      return next;
    });
    setCoverKey((cur) => {
      if (!wasPicked && cur == null) return frame.key; // first pick covers
      if (wasPicked && cur === frame.key) {
        const rest = [...picked.keys()].filter((k) => k !== frame.key);
        return rest[0] ?? null; // cover falls to the next pick
      }
      return cur;
    });
  };

  const canCreate = title.trim().length > 0 && picked.size > 0;

  const handleCreate = () => {
    if (!canCreate) {
      show(
        !title.trim() ? 'Give your highlight a name' : 'Select at least one frame',
        'error',
      );
      return;
    }
    const ordered = [...picked.values()];
    const cover = (coverKey ? picked.get(coverKey) : undefined) ?? ordered[0];
    const highlight: PosterHighlight = {
      id: `hl-${Date.now().toString(36)}`,
      title: title.trim(),
      coverUri: cover.mediaUrl,
      frames: ordered.map((f) => ({
        frameId: f.frameId,
        mediaUrl: f.mediaUrl,
        caption: f.caption,
      })),
    };
    createHighlight(highlight);
    show('Highlight created', 'success');
    onCreated(highlight);
  };

  return (
    <Sheet open={open} onClose={onClose} title="New highlight" maxWidth={640}>
      {frames.length === 0 ? (
        <EmptyState
          compact
          icon="images"
          title="No stories to pick from"
          subtitle="Publish a poster story first — its frames can be saved into a highlight."
        />
      ) : (
        <div className="flex min-h-full flex-col">
          {/* Name + cover */}
          <div className="px-5 pb-3 pt-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder="Highlight name"
                aria-label="Highlight name"
                maxLength={MAX_TITLE}
                className="h-11 min-w-0 flex-1 bg-transparent text-body text-input-text outline-none placeholder:text-text-muted"
              />
              <span className="tnum text-meta text-text-muted">
                {title.length}/{MAX_TITLE}
              </span>
            </div>

            {pickedList.length > 1 ? (
              <div className="mt-3">
                <p className="text-meta text-text-muted">Cover</p>
                <div
                  className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar"
                  role="listbox"
                  aria-label="Cover frame"
                >
                  {pickedList.map((f) => {
                    const isCover = coverKey === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        role="option"
                        aria-selected={isCover}
                        aria-label={isCover ? 'Current cover frame' : 'Set as cover frame'}
                        onClick={() => setCoverKey(f.key)}
                        className={`pressable relative h-16 w-10 shrink-0 overflow-hidden rounded-md bg-surface-alt ${
                          isCover ? 'ring-2 ring-brand' : ''
                        }`}
                      >
                        <AppImage
                          src={f.mediaUrl}
                          alt=""
                          fill
                          sizes="40px"
                          className="h-full w-full"
                        />
                        {isCover ? (
                          <span className="absolute inset-x-0 bottom-0 bg-overlay py-0.5 text-center text-micro font-semibold text-scrim-text-primary">
                            Cover
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <p className="px-5 pb-2 text-meta text-text-secondary" aria-live="polite">
            {picked.size > 0
              ? `${picked.size} ${picked.size === 1 ? 'frame' : 'frames'} selected`
              : 'Tap frames to add them'}
          </p>

          {/* Frame picker — every frame from your stories */}
          <div className="grid flex-1 grid-cols-3 content-start gap-1.5 px-5 pb-4 sm:grid-cols-4">
            {frames.map((f) => {
              const isPicked = picked.has(f.key);
              const isCover = coverKey === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggle(f)}
                  aria-pressed={isPicked}
                  aria-label={`${isPicked ? 'Remove' : 'Add'} frame${
                    f.caption ? `: ${f.caption}` : ''
                  }${isCover ? ' — cover' : ''}`}
                  className="pressable relative"
                >
                  <div
                    className={`relative aspect-[9/16] overflow-hidden rounded-lg bg-surface-alt ${
                      isPicked ? 'ring-2 ring-brand' : ''
                    }`}
                  >
                    <AppImage
                      src={f.mediaUrl}
                      alt={f.caption ?? 'Story frame'}
                      fill
                      sizes="(max-width: 640px) 30vw, 150px"
                      className="h-full w-full"
                    />
                    {isCover ? (
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-overlay py-1 text-micro font-semibold text-scrim-text-primary">
                        <Icon name="image" size={10} />
                        Cover
                      </span>
                    ) : isPicked ? (
                      <span
                        aria-hidden
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-text-inverse"
                      >
                        <Icon name="check" size={13} />
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="sticky bottom-0 border-t border-border-subtle bg-surface px-5 py-3">
            <Button fullWidth disabled={!canCreate} onClick={handleCreate}>
              {picked.size === 0
                ? 'Pick frames to create'
                : `Create highlight · ${picked.size} ${
                    picked.size === 1 ? 'frame' : 'frames'
                  }`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
