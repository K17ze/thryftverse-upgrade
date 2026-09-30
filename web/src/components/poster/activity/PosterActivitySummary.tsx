import React from 'react';
import type { PosterArchiveStory } from '@/lib/data/fixtures-posters';
import { formatCount, timeAgo } from '@/lib/utils/format';
import { hourLabel } from './PosterActivityPrimitives';

export function PosterActivitySummary({
  story,
  stats,
  hourly,
  peakHour,
}: {
  story: PosterArchiveStory;
  stats: {
    viewers: number;
    reactions: number;
    replies: number;
    completion: number;
  };
  hourly: number[];
  peakHour: number;
}) {
  return (
    <div className="lg:sticky lg:top-20 lg:self-start">
      <header className="px-4 pt-2 sm:px-6 lg:px-0">
        <p className="text-meta font-semibold uppercase tracking-wide text-text-muted">
          {story.status === 'active' ? 'Live story' : 'Archived story'}
        </p>
        <h1 className="mt-1 text-screen-title text-text-primary">
          Story activity
        </h1>
        <p className="mt-1 text-meta text-text-muted">
          {story.frames.length} {story.frames.length === 1 ? 'frame' : 'frames'} ·{' '}
          {story.status === 'active'
            ? `expires ${timeAgo(story.expiresAt).replace(' ago', '')} from now`
            : `ended ${timeAgo(story.expiresAt)}`}
        </p>
      </header>

      {/* Summary strip — flat stat row, tabular numerals */}
      <dl className="mt-5 grid grid-cols-4 gap-2 px-4 sm:px-6 lg:grid-cols-2 lg:px-0">
        {[
          { label: 'Viewers', value: stats.viewers },
          { label: 'Reactions', value: stats.reactions },
          { label: 'Replies', value: stats.replies },
          { label: 'Completion', value: `${stats.completion}%`, raw: true },
        ].map((s) => (
          <div key={s.label} className="border-t border-border-subtle pt-2.5">
            <dd className="tnum text-section-title font-bold text-text-primary">
              {s.raw ? s.value : formatCount(s.value as number)}
            </dd>
            <dt className="mt-0.5 text-meta text-text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      {/* Peak activity — 24-hour histogram, peak bar accented */}
      <section aria-label="Peak activity times" className="mt-8 px-4 sm:px-6 lg:px-0">
        <h2 className="text-body-emphasis font-semibold text-text-primary">
          Peak times
        </h2>
        <div
          className="mt-3 flex h-16 items-end gap-[3px]"
          role="img"
          aria-label={`Engagement by hour — busiest around ${hourLabel(peakHour)}`}
        >
          {hourly.map((n, h) => {
            const max = Math.max(...hourly, 1);
            const height = Math.max(3, Math.round((n / max) * 60));
            return (
              <span
                key={h}
                title={`${hourLabel(h)} — ${n} ${n === 1 ? 'event' : 'events'}`}
                className={`flex-1 rounded-full ${
                  h === peakHour ? 'bg-antique-gold' : 'bg-surface-elevated'
                }`}
                style={{ height }}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-micro text-text-muted">
          <span>12am</span>
          <span>6am</span>
          <span>12pm</span>
          <span>6pm</span>
        </div>
      </section>
    </div>
  );
}
