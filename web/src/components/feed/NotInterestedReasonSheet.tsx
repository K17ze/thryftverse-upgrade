'use client';

/**
 * NotInterestedReasonSheet — the "Not interested" follow-up.
 *
 * The hide has already applied when this opens; the sheet asks for the
 * reason once, honestly stating what each choice does to the feed
 * ("Fewer items in this size", "Only this item is hidden"). A pick writes
 * the reason into the local ranking layer (feedPrefs) and onto the
 * backend interaction's metadata; closing the sheet (X / Esc / scrim /
 * drag) commits the hide without a reason — a dismissal is never a lost
 * write.
 *
 * Mobile parity: the sheet grammar mirrors the feed-controls overlay
 * (FeedExplanationSheet), and "Undo — show it again" restores the tile
 * before any durable write lands.
 */

import { Sheet } from '@/components/ui/Sheet';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { NOT_INTERESTED_REASONS, type NotInterestedReason } from '@/lib/feedPrefs';
import { getListingCoverUri } from '@/lib/utils/media';

interface NotInterestedReasonSheetProps {
  open: boolean;
  listing: DiscoveryListingSummary | null;
  /** Reason pick — commits the hide with the reason attached. */
  onPick: (reason: NotInterestedReason) => void;
  /** Undo — restores the item before any durable write lands. */
  onUndo: () => void;
  /** Dismissal — commits the hide with no reason attached. */
  onSkip: () => void;
}

export function NotInterestedReasonSheet({
  open,
  listing,
  onPick,
  onUndo,
  onSkip,
}: NotInterestedReasonSheetProps) {
  if (!listing) return null;
  const cover = getListingCoverUri(listing.images);

  return (
    <Sheet open={open} onClose={onSkip} title="Hidden from your feed" maxWidth={440}>
      <div className="flex flex-col gap-5 px-5 py-5">
        {/* Item identity — what was just hidden. */}
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-alt">
            <AppImage src={cover} alt="" aspectRatio={1} className="h-full w-full" sizes="56px" />
          </div>
          <div className="min-w-0">
            <p className="clamp-2 text-body-emphasis font-semibold text-text-primary">
              {listing.title}
            </p>
            <p className="mt-0.5 text-meta text-text-muted">Won’t appear again</p>
          </div>
        </div>

        {/* Reason rows — each carries its real feed effect as the subline,
            so the choice is informed, not surveyed. */}
        <div>
          <p className="mb-1.5 text-label uppercase tracking-wide text-text-muted">
            Tell us why — optional
          </p>
          <div className="border-t border-border-subtle">
            {NOT_INTERESTED_REASONS.map((reason) => (
              <button
                key={reason.value}
                type="button"
                onClick={() => onPick(reason.value)}
                className="pressable flex min-h-12 w-full items-center justify-between gap-3 border-b border-border-subtle py-3 text-left hover:bg-surface-alt focus-visible:bg-surface-alt"
              >
                <span className="min-w-0">
                  <span className="block text-body font-medium text-text-primary">
                    {reason.label}
                  </span>
                  <span className="mt-0.5 block text-meta text-text-muted">
                    {reason.effect}
                  </span>
                </span>
                <Icon name="forward" size={15} className="shrink-0 text-text-muted" />
              </button>
            ))}
          </div>
        </div>

        {/* Undo — the hide was instant; this reverses it before the
            durable write, so a mis-tap costs nothing. */}
        <button
          type="button"
          onClick={onUndo}
          className="pressable flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-body font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
        >
          <Icon name="repeat" size={15} />
          Undo — show it again
        </button>
      </div>
    </Sheet>
  );
}
