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

import { useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import {
  isLocalUri,
  sharedMediaItemFor,
  sharedMediaItemsFor,
  type SharedMediaItem,
} from './media/sharedMediaModel';
import { useSharedMedia } from './media/useSharedMedia';
import { MediaLightbox } from './media/MediaLightbox';

export type { SharedMediaItem };
export { sharedMediaItemFor, sharedMediaItemsFor, useSharedMedia, MediaLightbox };

export function SharedMediaGrid({
  items,
  onDeleteItems,
}: {
  items: SharedMediaItem[];
  /**
   * Manage mode's trash action — the parent owns the write (delete-for-me
   * per message id). When absent the grid stays view-only and no Select
   * affordance renders.
   */
  onDeleteItems?: (items: SharedMediaItem[]) => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Mobile SharedConversationMediaScreen grammar: Select mode swaps the
  // header to "{n} selected" + trash, tiles toggle instead of opening the
  // viewer, the check overlay is the selected state.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelection = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0 || !onDeleteItems) return;
    const chosen = items.filter((it) => selectedIds.has(it.id));
    exitSelection();
    onDeleteItems(chosen);
  };

  return (
    <>
      {onDeleteItems ? (
        selecting ? (
          <div className="flex items-center justify-between px-4 pb-2">
            <div className="flex items-center gap-1">
              <IconButton
                name="close"
                aria-label="Exit selection"
                onClick={exitSelection}
                className="-ml-2"
              />
              <span className="tnum text-body-emphasis font-semibold text-text-primary">
                {selectedIds.size} selected
              </span>
            </div>
            <IconButton
              name="trash"
              aria-label={`Remove ${selectedIds.size} selected ${
                selectedIds.size === 1 ? 'item' : 'items'
              }`}
              disabled={selectedIds.size === 0}
              onClick={deleteSelected}
            />
          </div>
        ) : (
          <div className="flex justify-end px-4 pb-1">
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className="pressable min-h-[44px] px-2 text-meta font-semibold text-brand"
            >
              Select
            </button>
          </div>
        )
      ) : null}
      <div
        className="grid grid-cols-3 gap-0.5 px-4"
        role="list"
        aria-label="Shared media"
      >
        {items.map((item, i) => {
          const selected = selectedIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => (selecting ? toggle(item.id) : setViewerIndex(i))}
              aria-label={
                selecting
                  ? `${selected ? 'Deselect' : 'Select'} ${
                      item.isVideo ? 'video' : 'photo'
                    }`
                  : item.isVideo
                    ? 'View shared video'
                    : 'View shared photo'
              }
              aria-pressed={selecting ? selected : undefined}
              className={`pressable relative aspect-square overflow-hidden rounded-sm border bg-surface-alt ${
                selecting && selected
                  ? 'border-2 border-brand'
                  : 'border-border'
              }`}
            >
              {item.isVideo && !isLocalUri(item.uri) ? (
                <span className="flex h-full w-full items-center justify-center text-text-muted">
                  <Icon name="videocam" size={22} />
                </span>
              ) : isLocalUri(item.uri) ? (
                // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
                <img
                  src={item.uri}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <AppImage
                  src={item.uri}
                  alt=""
                  fill
                  sizes="120px"
                  className="h-full w-full"
                />
              )}
              {item.isVideo && !selecting ? (
                <span className="absolute bottom-1 right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-media-overlay-scrim text-scrim-text-primary">
                  <Icon name="play" size={10} filled />
                </span>
              ) : null}
              {selecting ? (
                <span
                  aria-hidden="true"
                  className={`absolute right-1 top-1 flex h-[20px] w-[20px] items-center justify-center rounded-full border ${
                    selected
                      ? 'border-brand bg-brand text-text-inverse'
                      : 'border-scrim-text-primary bg-media-overlay-scrim text-transparent'
                  }`}
                >
                  <Icon name="check" size={12} />
                </span>
              ) : null}
            </button>
          );
        })}
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
