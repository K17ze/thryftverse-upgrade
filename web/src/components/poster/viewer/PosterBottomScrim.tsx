'use client';

import { Icon } from '@/components/ui/Icon';
import type { PosterArchiveStory } from '@/lib/data/fixtures-posters';

interface PosterBottomScrimProps {
  caption: string | null | undefined;
  story?: PosterArchiveStory;
  storyStatus?: 'active' | 'archived';
  hoursLeft: number;
  frame: number;
  frameCount: number;
  canReply: boolean;
  authorUsername: string | null;
  replyDraft: string;
  onReplyDraftChange: (val: string) => void;
  sendingReply: boolean;
  onSendReply: () => void;
}

export function PosterBottomScrim({
  caption,
  story,
  storyStatus,
  hoursLeft,
  frame,
  frameCount,
  canReply,
  authorUsername,
  replyDraft,
  onReplyDraftChange,
  sendingReply,
  onSendReply,
}: PosterBottomScrimProps) {
  if (!caption && !story && !canReply) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent px-4 pb-6 pt-14">
      {caption ? (
        <p className="text-body-large font-medium text-scrim-text-primary">{caption}</p>
      ) : null}
      {story ? (
        <p className="mt-1.5 text-meta text-scrim-text-secondary">
          {storyStatus === 'active' ? (
            <span className="tnum">{hoursLeft}h left</span>
          ) : (
            'Archived'
          )}
          {frameCount > 1 ? (
            <span className="tnum"> · {frame + 1} / {frameCount}</span>
          ) : null}
        </p>
      ) : null}
      {canReply ? (
        <form
          className="pointer-events-auto mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSendReply();
          }}
        >
          <input
            value={replyDraft}
            onChange={(e) => onReplyDraftChange(e.target.value)}
            placeholder={`Reply to @${authorUsername ?? 'author'}…`}
            aria-label={`Reply to @${authorUsername ?? 'author'}`}
            maxLength={500}
            className="h-10 min-w-0 flex-1 rounded-full bg-overlay px-4 text-body text-scrim-text-primary outline-none placeholder:text-scrim-text-secondary focus:ring-1 focus:ring-white/60"
          />
          <button
            type="submit"
            disabled={!replyDraft.trim() || sendingReply}
            aria-label="Send reply"
            className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-overlay text-scrim-text-primary transition-opacity disabled:opacity-50"
          >
            <Icon name="send" size={17} />
          </button>
        </form>
      ) : null}
    </div>
  );
}
