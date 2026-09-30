'use client';

/**
 * MoodboardCoverHeader — immersive cover media header with gradient scrim,
 * inline title editing, private status indicator, and owner metadata badge.
 */

import { forwardRef } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';

interface MoodboardCoverHeaderProps {
  coverUri?: string | null;
  title: string;
  isPrivate: boolean;
  isEditing: boolean;
  isOwner: boolean;
  titleDraft: string;
  onTitleDraftChange: (val: string) => void;
  onCommitTitle: () => void;
  onResetTitle: () => void;
  owner?: {
    username: string;
    avatar?: string;
    isVerified?: boolean;
  } | null;
  itemCount: number;
  createdAt?: string;
}

export const MoodboardCoverHeader = forwardRef<
  HTMLInputElement,
  MoodboardCoverHeaderProps
>(function MoodboardCoverHeader(
  {
    coverUri,
    title,
    isPrivate,
    isEditing,
    isOwner,
    titleDraft,
    onTitleDraftChange,
    onCommitTitle,
    onResetTitle,
    owner,
    itemCount,
    createdAt,
  },
  ref,
) {
  return (
    <div className="relative mx-4 mt-1 overflow-hidden rounded-xl sm:mx-6">
      <div className="relative h-60 sm:h-80">
        <AppImage
          src={coverUri}
          alt={title}
          fill
          sizes="(max-width: 1200px) 100vw, 1200px"
          className="h-full w-full"
          priority
          fallbackIcon="layers"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          {isEditing && isOwner ? (
            <input
              ref={ref}
              value={titleDraft}
              onChange={(e) => onTitleDraftChange(e.target.value)}
              onBlur={onCommitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  onResetTitle();
                  e.currentTarget.blur();
                }
              }}
              aria-label="Board title"
              maxLength={60}
              className="w-full border-b border-transparent bg-transparent text-screen-title text-scrim-text-primary caret-scrim-text-primary outline-none transition-colors focus:border-scrim-text-primary/60 sm:text-display"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="clamp-1 text-screen-title text-scrim-text-primary sm:text-display">
                {title}
              </h1>
              {isPrivate ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                  <Icon name="lock" size={11} />
                  Private
                </span>
              ) : null}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-scrim-text-secondary">
            {owner ? (
              <>
                <Avatar src={owner.avatar} name={owner.username} size={22} />
                <span className="font-semibold">@{owner.username}</span>
                {owner.isVerified ? (
                  <Icon
                    name="verified"
                    filled
                    size={12}
                    className="text-scrim-text-primary"
                  />
                ) : null}
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className="tnum">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
            {createdAt ? (
              <>
                <span aria-hidden>·</span>
                <span>Updated {timeAgo(createdAt)}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});
