'use client';

import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { ReminderToggle } from '../ReminderToggle';
import { formatScheduled } from '../UpcomingRail';
import { liveSellerOf } from '../useLiveSessions';

/** Compact on-air row — media thumb, live dot, title, seller + viewers. */
function LiveDockRow({
  session,
  onWatch,
}: {
  session: LiveSession;
  onWatch: (session: LiveSession) => void;
}) {
  const seller = liveSellerOf(session);
  return (
    <li>
      <button
        type="button"
        onClick={() => onWatch(session)}
        aria-label={`Watch ${seller?.username ?? 'seller'} live — ${session.title}`}
        className="pressable -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-alt"
      >
        <span className="relative h-14 w-[84px] shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={session.coverUri}
            alt=""
            fill
            sizes="84px"
            className="h-full w-full"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 block text-body-emphasis text-text-primary">
            {session.title}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-meta text-text-muted">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
            <span className="clamp-1 min-w-0">
              <span className="tnum">
                {session.viewers != null ? `${formatCount(session.viewers)} watching` : 'Live'}
              </span>
              {seller?.username ? ` · @${seller.username}` : ''}
            </span>
          </span>
        </span>
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </button>
    </li>
  );
}

/** Compact scheduled row — media thumb, title, seller + start time, the
 *  shared reminder toggle. Non-navigating: upcoming shows have no watch
 *  surface yet. */
function UpNextDockRow({ session }: { session: LiveSession }) {
  const seller = liveSellerOf(session);
  const meta = [
    seller?.username ? `@${seller.username}` : null,
    session.scheduledAt ? formatScheduled(session.scheduledAt) : 'Scheduled',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="relative h-14 w-[84px] shrink-0 overflow-hidden rounded-md bg-surface-alt">
        <AppImage
          src={session.coverUri}
          alt=""
          fill
          sizes="84px"
          className="h-full w-full"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="clamp-1 block text-body-emphasis text-text-primary">
          {session.title}
        </span>
        <span className="tnum mt-1 block text-meta text-text-muted">{meta}</span>
      </span>
      <ReminderToggle session={session} className="shrink-0" />
    </li>
  );
}

/** The dock beside the hero — the rest of the on-air board ("Also live")
 *  as compact media rows, then the forward schedule ("Up next"). Rows are
 *  the same hairline-list grammar as Your shows: thumb, title, honest
 *  meta, one action each (watch / remind). */
export function LiveDock({
  live,
  upcoming,
  onWatch,
  className = '',
}: {
  live: LiveSession[];
  upcoming: LiveSession[];
  onWatch: (session: LiveSession) => void;
  className?: string;
}) {
  return (
    <aside className={`min-w-0 ${className}`} aria-label="More live and upcoming shows">
      {live.length > 0 ? (
        <div>
          <h3 className="mb-1 text-label text-text-muted">Also live</h3>
          <ul className="divide-y divide-border-subtle">
            {live.map((s) => (
              <LiveDockRow key={s.id} session={s} onWatch={onWatch} />
            ))}
          </ul>
        </div>
      ) : null}
      {upcoming.length > 0 ? (
        <div className={live.length > 0 ? 'mt-5' : ''}>
          <h3 className="mb-1 text-label text-text-muted">Up next</h3>
          <ul className="divide-y divide-border-subtle">
            {upcoming.map((s) => (
              <UpNextDockRow key={s.id} session={s} />
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
