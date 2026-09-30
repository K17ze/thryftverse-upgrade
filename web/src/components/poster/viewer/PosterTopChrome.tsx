'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { timeAgo } from '@/lib/utils/format';

interface PosterTopChromeProps {
  slides: string[];
  frameCount: number;
  frame: number;
  progress: number;
  author?: {
    avatar?: string | null;
    username?: string | null;
    isVerified?: boolean;
  } | null;
  authorUsername: string | null;
  authorHref: string | null;
  createdAt?: string;
  isOwn: boolean;
  onShare: () => void;
  onOpenOptions: () => void;
  onClose: () => void;
}

export function PosterTopChrome({
  slides,
  frameCount,
  frame,
  progress,
  author,
  authorUsername,
  authorHref,
  createdAt,
  isOwn,
  onShare,
  onOpenOptions,
  onClose,
}: PosterTopChromeProps) {
  const authorRow = (
    <>
      <Avatar src={author?.avatar ?? null} name={authorUsername} size={32} ring />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-body font-semibold text-scrim-text-primary">
          <span className="clamp-1">@{authorUsername ?? 'author'}</span>
          {author && 'isVerified' in author && author.isVerified ? (
            <Icon name="verified" size={13} className="shrink-0 text-scrim-text-primary" filled />
          ) : null}
        </span>
        {createdAt ? (
          <span className="block text-meta text-scrim-text-secondary">
            {timeAgo(createdAt)}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-media-overlay-scrim to-transparent px-3 pb-10 pt-3">
      {frameCount > 1 ? (
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={frameCount}
          aria-valuenow={frame + 1}
          aria-label={`Frame ${frame + 1} of ${frameCount}`}
        >
          {slides.map((_, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full rounded-full bg-white"
                style={{
                  width:
                    i < frame
                      ? '100%'
                      : i === frame
                        ? frame === frameCount - 1
                          ? '100%'
                          : `${Math.min(progress * 100, 100)}%`
                        : '0%',
                }}
              />
            </span>
          ))}
        </div>
      ) : null}

      <div className="pointer-events-auto mt-3 flex items-center gap-2.5">
        {authorHref ? (
          <Link
            href={authorHref}
            className="pressable flex min-w-0 flex-1 items-center gap-2.5 rounded-md"
            aria-label={`Open @${authorUsername ?? 'author'} profile`}
          >
            {authorRow}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">{authorRow}</div>
        )}
        <IconButton name="share" aria-label="Share poster" onMedia onClick={onShare} />
        {isOwn ? (
          <IconButton
            name="more"
            aria-label="Story options"
            onMedia
            onClick={onOpenOptions}
          />
        ) : null}
        <IconButton name="close" aria-label="Close poster" onMedia onClick={onClose} />
      </div>
    </div>
  );
}
