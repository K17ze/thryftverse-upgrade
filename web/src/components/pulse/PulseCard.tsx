'use client';

/**
 * PulseCard — one full-bleed slide in the Pulse snap feed.
 * Media fills the card; creator row rides the top scrim, caption and
 * shoppable chips the bottom, and the like/save/share rail sits on the
 * right edge — the short-form grammar, kept chrome-free (glyph scrims,
 * no persistent icon chrome). Like → likedLooks, save → saved, matching
 * the look page's favourites contract; guests hit the SignupWall.
 * Commerce kinds deep-link to their canonical surface (auction room,
 * listing) through the kind chip and caption — same destinations the
 * mobile event rows route to.
 */

import Link from 'next/link';
import { listingById, userById } from '@/lib/data/fixtures';
import type { PulseCardModel, PulseKind } from './pulseModel';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import type { SignupAction } from '@/components/auth/SignupWall';
import { formatCount, formatPrice, timeAgo } from '@/lib/utils/format';

/** Kind chips — mirrors the mobile icon/accent map (flame, bag, trending). */
const KIND_META: Record<
  Exclude<PulseKind, 'creator'>,
  { label: string; icon: AppIconName; tone: string }
> = {
  auction_live: { label: 'Live auction', icon: 'fire', tone: 'text-danger-text' },
  fresh_drop: { label: 'Fresh drop', icon: 'bag', tone: 'text-scrim-text-primary' },
  price_drop: { label: 'Price drop', icon: 'offer', tone: 'text-warning' },
};

interface PulseCardProps {
  card: PulseCardModel;
  priority?: boolean;
  /** Creator ids the session is following — lifted to the feed so the
   *  same seller stays in sync across cards. */
  followed: boolean;
  onToggleFollow: (creatorId: string) => void;
  requireAuth: (action: SignupAction) => boolean;
}

export function PulseCard({ card, priority, followed, onToggleFollow, requireAuth }: PulseCardProps) {
  const { show } = useToast();
  const creator = userById(card.creatorId);

  const hydrated = useHydrated();
  const likedStore = useStore((s) => s.likedLooks.includes(card.id));
  const toggleLikedLook = useStore((s) => s.toggleLikedLook);
  // Save writes the card's lead item — `saved` resolves as listings on
  // /saved, so a card-level id would be a dead write there. Posts with no
  // shoppable attachment fall back to the card id.
  const saveId = card.itemIds[0] ?? card.id;
  const savedStore = useStore((s) => s.saved.includes(saveId));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const liked = hydrated && likedStore;
  const saved = hydrated && savedStore;
  const likeCount = card.likeCount + (liked ? 1 : 0);

  const items = card.itemIds
    .map(listingById)
    .filter((l): l is NonNullable<typeof l> => l != null);

  const kicker = card.kind !== 'creator' ? KIND_META[card.kind] : null;

  const handleLike = () => {
    if (!requireAuth('save_item')) return;
    toggleLikedLook(card.id);
  };
  const handleSave = () => {
    if (!requireAuth('save_item')) return;
    toggleSaved(saveId);
    show(saved ? 'Removed from saved' : 'Saved', 'info');
  };
  const handleShare = async () => {
    const url = `${window.location.origin}${card.href}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: card.caption, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  return (
    <article
      className="relative h-full w-full overflow-hidden bg-surface-alt md:rounded-2xl"
      aria-label={card.caption}
    >
      <AppImage
        src={card.mediaUri}
        alt={card.caption}
        fill
        priority={priority}
        focalPoint={{ x: 0.5, y: 0.35 }}
        className="h-full w-full"
        sizes="(max-width: 768px) 100vw, 430px"
      />

      {/* Top scrim — creator row + kind chip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 via-black/25 to-transparent px-4 pb-14 pt-4">
        <div className="pointer-events-auto flex items-center gap-2.5">
          <Link
            href={creator ? `/u/${creator.username}` : '#'}
            className="pressable flex min-w-0 flex-1 items-center gap-2.5"
            aria-label={creator ? `View @${creator.username}'s profile` : 'Creator'}
          >
            <Avatar src={creator?.avatar} name={creator?.username} size={36} ring />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-body font-semibold text-scrim-text-primary">
                <span className="clamp-1">@{creator?.username ?? 'creator'}</span>
                {creator?.isVerified ? (
                  <Icon name="verified" size={14} className="shrink-0 text-scrim-text-primary" filled />
                ) : null}
              </span>
              {card.createdAt ? (
                <span className="block text-meta text-scrim-text-secondary">
                  {timeAgo(card.createdAt)}
                </span>
              ) : null}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => onToggleFollow(card.creatorId)}
            aria-pressed={followed}
            className={
              followed
                ? 'pressable h-8 shrink-0 rounded-full border border-white/50 px-3.5 text-label font-semibold text-scrim-text-primary'
                : 'pressable h-8 shrink-0 rounded-full bg-white px-3.5 text-label font-semibold text-black'
            }
          >
            {followed ? 'Following' : 'Follow'}
          </button>
        </div>

        {kicker ? (
          <Link
            href={card.href}
            className="pressable pointer-events-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5"
          >
            <Icon name={kicker.icon} size={13} className={kicker.tone} />
            <span className="text-label font-semibold uppercase tracking-wider text-scrim-text-primary">
              {kicker.label}
            </span>
            {card.meta ? (
              <span className="tnum text-meta text-scrim-text-secondary">· {card.meta}</span>
            ) : null}
          </Link>
        ) : null}
      </div>

      {/* Right rail — like, save, share. 44px targets, glyph scrims. */}
      <div className="absolute bottom-6 right-1.5 flex flex-col items-center gap-0.5">
        <span className="flex flex-col items-center">
          <button
            type="button"
            onClick={handleLike}
            aria-pressed={liked}
            aria-label={liked ? 'Unlike this post' : 'Like this post'}
            className="pressable flex h-11 w-11 items-center justify-center"
          >
            <Icon
              name="heart"
              filled={liked}
              size={26}
              className={`drop-scrim ${liked ? 'text-danger-text' : 'text-scrim-text-primary'}`}
            />
          </button>
          <span className="tnum -mt-1 text-meta font-medium text-scrim-text-primary drop-scrim">
            {formatCount(likeCount)}
          </span>
        </span>
        <button
          type="button"
          onClick={handleSave}
          aria-pressed={saved}
          aria-label={saved ? 'Remove this post from saved' : 'Save this post'}
          className="pressable flex h-11 w-11 items-center justify-center"
        >
          <Icon
            name="bookmark"
            filled={saved}
            size={24}
            className={`drop-scrim ${saved ? 'text-warning' : 'text-scrim-text-primary'}`}
          />
        </button>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share this post"
          className="pressable flex h-11 w-11 items-center justify-center"
        >
          <Icon name="share" size={24} className="text-scrim-text-primary drop-scrim" />
        </button>
      </div>

      {/* Bottom scrim — caption + shoppable chips. Commerce captions are
          the event title, so they deep-link to the canonical surface;
          creator captions stay text (the row above links the profile). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pb-5 pl-4 pr-16 pt-16">
        {card.kind === 'creator' ? (
          <p className="pointer-events-auto clamp-2 text-body font-medium text-scrim-text-primary">
            {card.caption}
          </p>
        ) : (
          <Link
            href={card.href}
            className="pressable pointer-events-auto block clamp-2 text-body font-medium text-scrim-text-primary"
          >
            {card.caption}
          </Link>
        )}
        {items.length > 0 ? (
          <div className="pointer-events-auto no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/item/${item.id}`}
                className="pressable flex min-w-0 max-w-[220px] shrink-0 items-center gap-2 rounded-full bg-black/55 py-1 pl-1 pr-3"
                aria-label={`View ${item.title} — ${formatPrice(item.price)}`}
              >
                <AppImage
                  src={item.images[0]}
                  alt=""
                  fill
                  sizes="28px"
                  className="h-7 w-7 shrink-0 rounded-full"
                />
                <span className="clamp-1 min-w-0 text-caption font-medium text-scrim-text-primary">
                  {item.title}
                </span>
                <span className="tnum shrink-0 text-caption font-semibold text-scrim-text-primary">
                  {formatPrice(item.price)}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
