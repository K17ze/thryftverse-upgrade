'use client';

/**
 * Upcoming rail — horizontal scheduled shows beyond today. Card media is
 * the object; scheduled time and seller sit on the canvas below. "Remind
 * me" toggles honestly — the flag persists (liveReminders store) and set
 * state reads as set, not faked.
 */

import type { LiveSession } from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { ReminderToggle } from './ReminderToggle';

export function formatScheduled(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (dayDiff <= 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

interface UpcomingRailProps {
  sessions: LiveSession[];
}

export function UpcomingRail({ sessions }: UpcomingRailProps) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
      {sessions.map((s) => {
        const seller = userById(s.sellerId);
        return (
          <article key={s.id} className="w-[200px] shrink-0 sm:w-[220px]">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-surface-alt">
              <AppImage
                src={s.coverUri}
                alt={s.title}
                fill
                className="h-full w-full"
                sizes="220px"
              />
              {s.scheduledAt ? (
                <span className="absolute left-2 top-2 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                  {formatScheduled(s.scheduledAt)}
                </span>
              ) : null}
            </div>
            <div className="px-0.5 pt-2.5">
              <h3 className="clamp-2 text-body font-medium text-text-primary">{s.title}</h3>
              <p className="mt-1 text-meta text-text-muted">@{seller?.username ?? 'seller'}</p>
              <div className="mt-2.5">
                <ReminderToggle session={s} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
