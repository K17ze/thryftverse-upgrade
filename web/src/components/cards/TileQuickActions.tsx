'use client';

import type { DiscoveryListingSummary } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { FeedItemMenu } from '@/components/feed/FeedItemMenu';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';

interface TileQuickActionsProps {
  item: DiscoveryListingSummary;
}

/**
 * Quick actions — 44px hit areas, glyph scrim, no chrome circles.
 * quick-actions reveals on hover/focus-within where hover exists;
 * touch viewports keep the cluster always visible. Sold tiles
 * suppress save/wishlist/share while preserving feed item tuning.
 */
export function TileQuickActions({ item }: TileQuickActionsProps) {
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const hydrated = useHydrated();
  const wishlisted = useStore((s) => s.wishlist.includes(item.id));
  const toggleFav = useStore((s) => s.toggleWishlist);
  const savedItem = useStore((s) => s.saved.includes(item.id));
  const toggleSaved = useStore((s) => s.toggleSaved);

  const isFav = hydrated && wishlisted;
  const isSaved = hydrated && savedItem;

  const handleHeart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('save_item')) return;
    const adding = !isFav;
    void toggleFav(item.id).then((ok) => {
      if (ok) {
        if (adding) show('Added to wishlist', 'success');
      } else {
        show('Couldn’t sync — your wishlist was restored', 'error');
      }
    });
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('save_item')) return;
    const removing = isSaved;
    void toggleSaved(item.id).then((ok) => {
      show(
        ok
          ? removing
            ? 'Removed from saved'
            : 'Added to saved'
          : 'Couldn’t sync — saved items restored',
        ok ? 'info' : 'error',
      );
    });
  };

  const shareListing = async () => {
    const url = `${window.location.origin}/item/${item.id}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${item.title} on ThryftVerse`, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Listing link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void shareListing();
  };

  return (
    <div className="quick-actions absolute bottom-0 right-0 z-elevated flex items-center transition-opacity">
      {/* Feed controls — renders only inside a feed surface (FeedControlsProvider); null everywhere else. */}
      <FeedItemMenu item={item} />
      {item.isSold ? null : (
        <>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share listing"
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon
              name="share"
              size={19}
              className="text-scrim-text-primary drop-scrim"
            />
          </button>
          <button
            type="button"
            onClick={handleSave}
            aria-label={isSaved ? 'Remove from saved' : 'Save item'}
            aria-pressed={isSaved}
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon
              name="bookmark"
              filled={isSaved}
              size={20}
              className={
                isSaved
                  ? 'text-brand drop-scrim'
                  : 'text-scrim-text-primary drop-scrim'
              }
            />
          </button>
          <button
            type="button"
            onClick={handleHeart}
            aria-label={isFav ? 'Remove from wishlist' : 'Add to wishlist'}
            aria-pressed={isFav}
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon
              name="heart"
              filled={isFav}
              size={21}
              className={
                isFav
                  ? 'text-danger-text drop-scrim'
                  : 'text-scrim-text-primary drop-scrim'
              }
            />
          </button>
        </>
      )}
    </div>
  );
}
