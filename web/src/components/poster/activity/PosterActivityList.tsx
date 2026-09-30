import React from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import {
  POSTER_REACTION_META,
  type PosterReaction,
  type PosterStoryActivity,
} from '@/lib/data/fixtures-content';
import type { PosterArchiveStory } from '@/lib/data/fixtures-posters';
import { timeAgo } from '@/lib/utils/format';
import type { ActivityTab, StyleSticker } from './PosterActivityPrimitives';

function ListEmpty({ copy }: { copy: string }) {
  return <li className="py-8 text-center text-body text-text-muted">{copy}</li>;
}

export function PosterActivityList({
  tabs,
  tab,
  setTab,
  activity,
  story,
  sticker,
  isLive,
}: {
  tabs: { value: ActivityTab; label: string; count?: number }[];
  tab: ActivityTab;
  setTab: (tab: ActivityTab) => void;
  activity: PosterStoryActivity;
  story: PosterArchiveStory;
  sticker?: StyleSticker;
  isLive: boolean;
}) {
  return (
    <div>
      <div className="mt-7 px-4 sm:px-6 lg:mt-2 lg:px-0">
        <SegmentedControl options={tabs} value={tab} onChange={setTab} />
      </div>

      <ul className="mt-2 divide-y divide-border-subtle px-4 sm:px-6 lg:px-0" aria-live="polite">
        {tab === 'viewers' &&
          activity.viewers.map((v) => (
            <li key={v.userId} className="flex items-center gap-3 py-3">
              <Avatar src={v.avatar} name={v.username ?? 'viewer'} size={38} />
              <div className="min-w-0 flex-1">
                <p className="clamp-1 text-body font-medium text-text-primary">
                  {v.username ? `@${v.username}` : 'Member'}
                </p>
                <p className="text-meta text-text-muted">
                  <span className="tnum">
                    Saw {v.viewedFrameCount} of {story.frames.length}{' '}
                    {story.frames.length === 1 ? 'frame' : 'frames'}
                  </span>
                </p>
              </div>
              <span className="tnum shrink-0 text-meta text-text-muted">
                {timeAgo(v.latestViewedAt)}
              </span>
            </li>
          ))}

        {tab === 'reactions' &&
          (activity.reactions.length === 0 ? (
            <ListEmpty copy="No reactions yet — reactions show up here." />
          ) : (
            activity.reactions.map((r, i) => {
              const meta = POSTER_REACTION_META[r.reaction as PosterReaction];
              const frameIndex = story.frames.findIndex((f) => f.id === r.frameId);
              return (
                <li key={`${r.userId}-${i}`} className="flex items-center gap-3 py-3">
                  <Avatar src={r.avatar} name={r.username ?? 'viewer'} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body font-medium text-text-primary">
                      {r.username ? `@${r.username}` : 'Member'}
                    </p>
                    <p className="text-meta text-text-muted">
                      Reacted {meta?.label ?? r.reaction}
                      {frameIndex >= 0 && story.frames.length > 1
                        ? ` · frame ${frameIndex + 1}`
                        : ''}
                    </p>
                  </div>
                  {meta ? (
                    <Icon name={meta.icon} size={18} className="shrink-0 text-warning-text" />
                  ) : null}
                  <span className="tnum shrink-0 text-meta text-text-muted">
                    {timeAgo(r.createdAt)}
                  </span>
                </li>
              );
            })
          ))}

        {tab === 'replies' &&
          (activity.replies.length === 0 ? (
            <ListEmpty copy="No replies yet — replies land in your inbox too." />
          ) : (
            activity.replies.map((r) => {
              const frameIndex = story.frames.findIndex((f) => f.id === r.frameId);
              return (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  <Avatar src={r.authorAvatar} name={r.authorUsername ?? 'viewer'} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="clamp-1 text-body font-medium text-text-primary">
                      {r.authorUsername ? `@${r.authorUsername}` : 'Member'}
                      <span className="tnum font-normal text-text-muted">
                        {' '}· {timeAgo(r.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-body text-text-secondary">{r.body}</p>
                    {frameIndex >= 0 && story.frames.length > 1 ? (
                      <p className="mt-0.5 text-meta text-text-muted">
                        On frame {frameIndex + 1}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })
          ))}

        {tab === 'stickers' &&
          sticker &&
          (activity.styleVotes.length === 0 ? (
            <ListEmpty copy={`No votes on “${sticker.label}” yet.`} />
          ) : (
            <>
              <li className="py-3">
                <p className="text-body font-medium text-text-primary">{sticker.label}</p>
                <ul className="mt-2 space-y-1.5">
                  {sticker.options.map((opt) => {
                    const votes = activity.styleVotes.filter((v) => v.optionId === opt.id).length;
                    const pct = Math.round((votes / activity.styleVotes.length) * 100);
                    return (
                      <li key={opt.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between text-meta text-text-secondary">
                            <span>{opt.label}</span>
                            <span className="tnum">{pct}%</span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-alt">
                            <span
                              className="block h-full rounded-full bg-brand"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
              {activity.styleVotes.slice(0, 20).map((v, i) => (
                <li key={`${v.userId}-${i}`} className="flex items-center gap-3 py-2.5">
                  <Avatar src={null} name={v.username ?? 'viewer'} size={30} />
                  <p className="min-w-0 flex-1 text-meta text-text-secondary">
                    <span className="font-medium text-text-primary">
                      {v.username ? `@${v.username}` : 'Member'}
                    </span>{' '}
                    voted{' '}
                    <span className="font-medium">
                      {sticker.options.find((o) => o.id === v.optionId)?.label ?? v.optionId}
                    </span>
                  </p>
                  <span className="tnum shrink-0 text-meta text-text-muted">
                    {timeAgo(v.createdAt)}
                  </span>
                </li>
              ))}
            </>
          ))}
      </ul>

      {!isLive ? (
        <p className="mt-6 flex items-center gap-1.5 px-4 text-caption text-text-muted sm:px-6 lg:px-0">
          <Icon name="info" size={14} className="shrink-0" />
          Fixture dataset — a deterministic demo contract standing in for the
          live activity endpoint.
        </p>
      ) : null}
    </div>
  );
}
