'use client';

/**
 * LiveNowCard — the dominant object on the live surface. Full media,
 * LIVE badge + viewer count on top, bottom scrim carrying seller, title
 * and the Watch action. Two grammars: hero (first live) and rail card.
 */

import type { LiveSession } from '@/lib/data/fixtures-media';
import { liveSellerOf } from './useLiveSessions';
import { useSessionPins } from './livePins';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { LiveBadge } from './LiveBadge';
import { DATA_MODE } from '@/lib/api/client';
import { listingById } from '@/lib/data/fixtures';
import { getListingCoverUri } from '@/lib/utils/media';
import { formatCount, formatPrice } from '@/lib/utils/format';

interface LiveNowCardProps {
  session: LiveSession;
  onWatch: (session: LiveSession) => void;
  /** hero = full-width dominant media; card = rail/grid companion. */
  variant?: 'hero' | 'card';
}

export function LiveNowCard({ session, onWatch, variant = 'card' }: LiveNowCardProps) {
  const seller = liveSellerOf(session);
  const hero = variant === 'hero';

  // The lot on the table — fixture sessions resolve the first pinned
  // listing (the shared pins store; live mode has no pins endpoint and
  // carries currentItemTitle/currentBid on the session instead).
  const pinIds = useSessionPins(session.id);
  const onTable =
    hero && DATA_MODE !== 'live' && pinIds.length > 0
      ? listingById(pinIds[0]) ?? null
      : null;

  return (
    <article className={hero ? '' : 'w-[280px] shrink-0 sm:w-[320px]'}>
      <button
        type="button"
        onClick={() => onWatch(session)}
        aria-label={`Watch ${seller?.username ?? 'seller'} live — ${session.title}`}
        className="pressable group block w-full text-left"
      >
        <div
          className={`relative w-full overflow-hidden rounded-xl bg-surface-alt ${
            // Hero sits in a ~8/13 column at lg (dock beside it), full
            // width below — broadcast aspect in the split, capped so a
            // dockless hero never eats the viewport.
            hero ? 'aspect-[4/3] sm:aspect-[16/9] lg:max-h-[560px]' : 'aspect-[4/3]'
          }`}
        >
          <AppImage
            src={session.coverUri}
            alt={session.title}
            fill
            priority={hero}
            className="h-full w-full"
            sizes={hero ? '(max-width: 1024px) 100vw, 62vw' : '320px'}
          />

          {/* Top chrome — badge + viewers, no solid circles */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
            <LiveBadge />
            {session.viewers != null ? (
              <span className="tnum inline-flex items-center gap-1.5 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                <Icon name="eye" size={12} />
                {formatCount(session.viewers)}
              </span>
            ) : null}
          </div>

          {/* Bottom scrim — media scrim gradient only, per contract */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-4 pt-16 sm:px-5">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Avatar src={seller?.avatar} name={seller?.username} size={26} />
                  <span className="text-body font-semibold text-scrim-text-primary">
                    @{seller?.username ?? 'seller'}
                  </span>
                  {seller?.isVerified ? (
                    <Icon name="verified" size={14} className="text-scrim-text-primary" filled />
                  ) : null}
                  {/* Category context — real session field; live-mode rooms
                      carry none, so it simply doesn't render there. */}
                  {session.category ? (
                    <span className="clamp-1 min-w-0 text-meta text-scrim-text-secondary">
                      · {session.category}
                    </span>
                  ) : null}
                </div>
                <h3
                  className={`clamp-2 mt-2 font-semibold text-scrim-text-primary ${
                    hero ? 'text-item-title sm:text-section-title' : 'text-body-emphasis'
                  }`}
                >
                  {session.title}
                </h3>
                {/* What's selling — the first pin is the lot on the table
                    (fixture shows); sits inside the watch target so a tap
                    lands on the show that sells it. */}
                {onTable ? (
                  <span className="mt-3 flex w-fit max-w-full items-center gap-2.5 rounded-lg bg-overlay/90 px-2.5 py-2">
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-sm bg-white/10">
                      <AppImage
                        src={getListingCoverUri(onTable.images)}
                        alt=""
                        fill
                        sizes="36px"
                        className="h-full w-full"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-scrim-text-secondary">
                        On the table
                      </span>
                      <span className="clamp-1 block text-caption font-medium text-scrim-text-primary">
                        {onTable.title}
                        {' · '}
                        <span className="tnum font-semibold">{formatPrice(onTable.price)}</span>
                      </span>
                    </span>
                  </span>
                ) : null}
                {/* Live-mode contract fields — render only when the backend
                    reports a lot under the hammer (mobile bidRow parity). */}
                {session.currentBid != null ? (
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="clamp-1 text-meta text-scrim-text-secondary">
                      {session.currentItemTitle ?? 'Current bid'}
                    </span>
                    <span className="tnum shrink-0 text-body-emphasis font-semibold text-scrim-text-primary">
                      {formatPrice(session.currentBid)}
                    </span>
                  </div>
                ) : null}
              </div>
              <span
                className={`pressable inline-flex shrink-0 items-center gap-1.5 rounded-full bg-scrim-text-primary font-semibold text-black ${
                  hero ? 'h-11 px-6 text-body-emphasis' : 'h-9 px-4 text-caption'
                }`}
              >
                <Icon name="play" filled size={hero ? 16 : 13} />
                Watch
              </span>
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}
