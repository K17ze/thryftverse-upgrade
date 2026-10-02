import React from 'react';
import { Tabs } from '@/components/ui/Tabs';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import type { HomeSignal } from '@/components/home/homeSignals';

export type FeedMode = 'foryou' | 'following';

export function HomeControlBar({
  mode,
  onSelectMode,
  followingCount,
  signalChips,
  activeSignal,
  onSelectSignal,
  onRefresh,
  isRefreshing,
  idBase,
}: {
  mode: FeedMode;
  onSelectMode: (mode: FeedMode) => void;
  followingCount?: number;
  signalChips: HomeSignal[];
  activeSignal: HomeSignal;
  onSelectSignal: (signal: HomeSignal) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  /** Tab↔tabpanel pairing base — the caller's useId() (see ui/Tabs). */
  idBase?: string;
}) {
  return (
    <div className="sticky top-14 z-elevated flex items-center gap-3 border-b border-border-subtle bg-background px-4 py-2 sm:px-6 md:top-16">
      <Tabs
        tabs={[
          { key: 'foryou', label: 'For you' },
          { key: 'following', label: 'Following', count: followingCount },
        ]}
        active={mode}
        onChange={onSelectMode}
        ariaLabel="Feed mode"
        idBase={idBase}
        hairline={false}
        className="shrink-0"
      />
      <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
        {signalChips.map((s) => (
          <Chip
            key={s.key}
            selected={activeSignal.key === s.key}
            onClick={() => onSelectSignal(s)}
          >
            {s.personalized ? (
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeSignal.key === s.key ? 'bg-text-inverse' : 'bg-brand'
                }`}
                aria-hidden
              />
            ) : null}
            {s.label}
          </Chip>
        ))}
      </div>
      <IconButton
        name="refresh"
        aria-label="Refresh feed"
        onClick={onRefresh}
        disabled={isRefreshing}
        className={isRefreshing ? 'motion-safe:animate-spin' : ''}
      />
    </div>
  );
}
