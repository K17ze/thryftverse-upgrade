'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll } from '@/lib/a11y/scrollLock';
import { restoreFocus } from '@/lib/a11y/focus';
import { AppImage } from '@/components/ui/AppImage';
import { IconButton } from '@/components/ui/IconButton';
import {
  formatStamp,
  isLocalUri,
  type SharedMediaItem,
} from './sharedMediaModel';

/**
 * MediaLightbox — fullscreen viewer for shared media: scrim click and
 * Escape close, arrows page the set, sender + timestamp in the top chrome.
 * blob: URIs and videos render through plain media elements (not
 * optimizable through next/image). Exported — ChatPanel opens the same
 * viewer for inline message media (mobile ChatMediaPreviewScreen parity).
 */
export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: SharedMediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const count = items.length;
  const current = Math.min(Math.max(index, 0), Math.max(0, count - 1));
  const item = items[current];
  const dialogRef = useRef<HTMLDivElement>(null);

  const step = (dir: 1 | -1) => {
    if (count < 2) return;
    onIndexChange((current + dir + count) % count);
  };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    // Refcounted body lock — a direct `overflow = ''` write would drop a
    // sibling overlay's lock while the lightbox is still open.
    const releaseScroll = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      releaseScroll();
      restoreFocus(prev);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, count, current]);

  if (!item) return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Shared media ${current + 1} of ${count}`}
      tabIndex={-1}
      className="fixed inset-0 z-modal flex flex-col bg-overlay outline-none"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between px-2 py-2 sm:px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 px-2 text-meta font-medium text-scrim-text-primary">
          {item.senderLabel}
          {formatStamp(item.timestamp)
            ? ` · ${formatStamp(item.timestamp)}`
            : ''}
        </p>
        <IconButton
          name="close"
          aria-label="Close media viewer"
          onMedia
          onClick={onClose}
        />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 sm:px-16">
        <div
          className="flex max-h-full w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {item.isVideo ? (
            <video
              key={item.id}
              src={item.uri}
              controls
              autoPlay
              className="max-h-[78dvh] max-w-full rounded-lg"
            />
          ) : isLocalUri(item.uri) ? (
            // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
            <img
              key={item.id}
              src={item.uri}
              alt={`Shared by ${item.senderLabel}`}
              className="max-h-[78dvh] max-w-full rounded-lg object-contain"
            />
          ) : (
            <AppImage
              key={item.id}
              src={item.uri}
              alt={`Shared by ${item.senderLabel}`}
              fill
              sizes="92vw"
              quality={90}
              imgClassName="object-contain"
              className="h-[78dvh] w-full"
            />
          )}
        </div>
      </div>

      {count > 1 ? (
        <>
          <IconButton
            name="back"
            aria-label="Previous media"
            onMedia
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 max-sm:hidden"
          />
          <IconButton
            name="forward"
            aria-label="Next media"
            onMedia
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 max-sm:hidden"
          />
        </>
      ) : null}

      <div
        className="flex items-center justify-center pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="tnum text-caption font-medium text-scrim-text-secondary">
          {current + 1} / {count}
        </span>
      </div>
    </div>,
    document.body,
  );
}
