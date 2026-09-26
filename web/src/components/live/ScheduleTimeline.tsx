'use client';

/**
 * ScheduleTimeline — "Today's schedule" as rows, not cards: wall-clock
 * time · show · seller, hairline-separated, each row closing with the
 * persisted reminder toggle. Built only from sessions actually scheduled
 * for today — when nothing is scheduled today the section doesn't render
 * (the caller decides), so the timeline never pads with tomorrow's shows.
 */

import type { LiveSession } from '@/lib/data/fixtures-media';
import { userById } from '@/lib/data/fixtures';
import { ReminderToggle } from './ReminderToggle';

/** "19:45" — the schedule column reads as a timetable, tnum aligned. */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function isSameDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

interface ScheduleTimelineProps {
  sessions: LiveSession[];
}

export function ScheduleTimeline({ sessions }: ScheduleTimelineProps) {
  if (sessions.length === 0) return null;

  return (
    <ul className="divide-y divide-border-subtle border-y border-border-subtle">
      {sessions.map((s) => {
        const seller = userById(s.sellerId);
        return (
          <li key={s.id} className="flex items-center gap-4 py-3">
            <time
              dateTime={s.scheduledAt}
              className="tnum w-12 shrink-0 text-numeric-meta text-text-primary"
            >
              {s.scheduledAt ? formatTime(s.scheduledAt) : '--:--'}
            </time>
            <div className="min-w-0 flex-1">
              <p className="clamp-1 text-body-emphasis text-text-primary">{s.title}</p>
              <p className="mt-0.5 text-meta text-text-muted">
                @{seller?.username ?? 'seller'}
              </p>
            </div>
            <ReminderToggle session={s} />
          </li>
        );
      })}
    </ul>
  );
}
