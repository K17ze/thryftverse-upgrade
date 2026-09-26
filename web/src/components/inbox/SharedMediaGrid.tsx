'use client';

/**
 * SharedMediaGrid — the thread's shared-media surface, ported from mobile
 * SharedConversationMediaScreen + GroupMediaStrip: every media message in
 * the conversation rendered as a 3-column, 2px-gap grid; videos carry a
 * scrim play badge. A tile opens the MediaLightbox — flat overlay, sender
 * and time chrome, arrows page through the set.
 *
 * Fixture mode collects media from the thread's messages; live mode also
 * merges the conversation's /media feed so older attachments that scrolled
 * out of the local cache still appear.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DATA_MODE } from '@/lib/api/client';
import type { Conversation, Message } from '@/lib/contracts/domain';
import { isVideoUri } from '@/lib/utils/media';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { senderLabelFor } from './inboxModel';

export interface SharedMediaItem {
  id: string;
  uri: string;
  isVideo: boolean;
  senderLabel: string;
  timestamp?: string;
}

const isLocalUri = (uri: string) => uri.startsWith('blob:') || uri.startsWith('data:');

function isMine(m: Message): boolean {
  return m.sender === 'me' || m.senderId === 'me';
}

function toItem(c: Conversation, m: Message): SharedMediaItem | null {
  if (!m.mediaUri) return null;
  return {
    id: m.id,
    uri: m.mediaUri,
    isVideo: m.mediaType === 'video' || isVideoUri(m.mediaUri),
    senderLabel: isMine(m) ? 'You' : senderLabelFor(c, m.senderId),
    timestamp: m.timestamp,
  };
}

function collectMedia(c: Conversation): SharedMediaItem[] {
  return (c.messages ?? [])
    .map((m) => toItem(c, m))
    .filter((x): x is SharedMediaItem => x !== null);
}

export function useSharedMedia(conversation: Conversation | null | undefined) {
  const [remote, setRemote] = useState<SharedMediaItem[]>([]);
  const conversationId = conversation?.id;

  // Live mode fetches the server media feed once — the local store only
  // retains recently scrolled messages. Fixture mode is already complete.
  useEffect(() => {
    if (!conversationId || DATA_MODE !== 'live') return;
    let active = true;
    import('@/lib/api/http')
      .then(({ fetchJson }) =>
        fetchJson<{ items?: unknown[] }>(
          `/chat/conversations/${conversationId}/media?limit=60`,
        ),
      )
      .then((payload) => {
        if (!active || !payload?.items) return;
        setRemote(
          (payload.items as Array<{
            id: string;
            mediaUri: string;
            mediaType?: string;
            senderUserId?: string | null;
            createdAt?: string;
          }>)
            .filter((it) => it.mediaType !== 'document')
            .map((it) => ({
              id: it.id,
              uri: it.mediaUri,
              isVideo: it.mediaType === 'video' || isVideoUri(it.mediaUri),
              senderLabel: 'Member',
              timestamp: it.createdAt,
            })),
        );
      })
      .catch(() => {
        // Media absence is honest — the grid renders what the thread knows.
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  return useMemo(() => {
    if (!conversation) return [];
    const local = collectMedia(conversation);
    const seen = new Set(local.map((m) => m.id));
    return [...local, ...remote.filter((m) => !seen.has(m.id))];
  }, [conversation, remote]);
}

export function SharedMediaGrid({ items }: { items: SharedMediaItem[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-0.5 px-4" role="list" aria-label="Shared media">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="listitem"
            onClick={() => setViewerIndex(i)}
            aria-label={item.isVideo ? 'View shared video' : 'View shared photo'}
            className="pressable relative aspect-square overflow-hidden rounded-sm border border-border bg-surface-alt"
          >
            {item.isVideo && !isLocalUri(item.uri) ? (
              <span className="flex h-full w-full items-center justify-center text-text-muted">
                <Icon name="videocam" size={22} />
              </span>
            ) : isLocalUri(item.uri) ? (
              // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
              <img src={item.uri} alt="" className="h-full w-full object-cover" />
            ) : (
              <AppImage src={item.uri} alt="" fill sizes="120px" className="h-full w-full" />
            )}
            {item.isVideo ? (
              <span className="absolute bottom-1 right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-media-overlay-scrim text-scrim-text-primary">
                <Icon name="play" size={10} filled />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {viewerIndex !== null ? (
        <MediaLightbox
          items={items}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

function formatStamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * MediaLightbox — fullscreen viewer for shared media: scrim click and
 * Escape close, arrows page the set, sender + timestamp in the top chrome.
 * blob: URIs and videos render through plain media elements (not
 * optimizable through next/image).
 */
function MediaLightbox({
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
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
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
          {formatStamp(item.timestamp) ? ` · ${formatStamp(item.timestamp)}` : ''}
        </p>
        <IconButton name="close" aria-label="Close media viewer" onMedia onClick={onClose} />
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
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex"
          />
          <IconButton
            name="forward"
            aria-label="Next media"
            onMedia
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex"
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
