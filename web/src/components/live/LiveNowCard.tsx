'use client';

/**
 * LiveNowCard — the dominant object on the live surface. Full media,
 * LIVE badge + viewer count on top, bottom scrim carrying seller, title
 * and the Watch action. Two grammars: hero (first live) and rail card.
 */

import type { LiveSession } from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { LiveBadge } from './LiveBadge';
import { formatCount, formatPrice } from '@/lib/utils/format';

interface LiveNowCardProps {
  session: LiveSession;
  onWatch: (session: LiveSession) => void;
  /** hero = full-width dominant media; card = rail/grid companion. */
  variant?: 'hero' | 'card';
}

export function LiveNowCard({ session, onWatch, variant = 'card' }: LiveNowCardProps) {
  const seller = userById(session.sellerId);
  const hero = variant === 'hero';

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
            hero ? 'aspect-[4/3] sm:aspect-[21/9]' : 'aspect-[4/3]'
          }`}
        >
          <AppImage
            src={session.coverUri}
            alt={session.title}
            fill
            priority={hero}
            className="h-full w-full"
            sizes={hero ? '(max-width: 768px) 100vw, 1440px' : '320px'}
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
                </div>
                <h3
                  className={`clamp-2 mt-2 font-semibold text-scrim-text-primary ${
                    hero ? 'text-item-title sm:text-section-title' : 'text-body-emphasis'
                  }`}
                >
                  {session.title}
                </h3>
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
