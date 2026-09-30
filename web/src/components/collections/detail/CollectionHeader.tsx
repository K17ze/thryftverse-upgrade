'use client';

/**
 * CollectionHeader — collection presentation header.
 * Displays either a 4-item hero mosaic cover with gradient scrim or a clean
 * typography header (for seller closets), with owner link, counts, and privacy tags.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';

interface CollectionHeaderProps {
  showHero: boolean;
  heroThumbs: string[];
  title: string;
  isPrivate?: boolean;
  archived?: boolean;
  owner?: {
    username: string;
    avatar?: string;
    isVerified?: boolean;
  } | null;
  itemCount: number;
  meta?: string;
  description?: string | null;
}

export function CollectionHeader({
  showHero,
  heroThumbs,
  title,
  isPrivate,
  archived,
  owner,
  itemCount,
  meta,
  description,
}: CollectionHeaderProps) {
  if (showHero) {
    return (
      /* Cover hero — item-cover mosaic strip with the title/meta over a
         legibility scrim. Media is the colour; no separate header below. */
      <div className="relative mx-4 mt-1 overflow-hidden rounded-xl sm:mx-6">
        <div className="grid h-44 grid-cols-4 gap-0.5 sm:h-56 lg:h-64">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="relative overflow-hidden">
              {heroThumbs[i] ? (
                <AppImage
                  src={heroThumbs[i]}
                  alt=""
                  fill
                  sizes="25vw"
                  className="h-full w-full"
                  priority={i === 0}
                />
              ) : (
                <div className="h-full w-full bg-surface-alt" />
              )}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h1 className="clamp-1 text-screen-title text-scrim-text-primary">
              {title}
            </h1>
            {isPrivate ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                <Icon name="lock" size={11} />
                Private
              </span>
            ) : null}
            {archived ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
                Archived
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-scrim-text-secondary">
            {owner ? (
              <>
                <Link
                  href={`/u/${owner.username}`}
                  className="flex items-center gap-1.5 hover:opacity-80"
                >
                  <Avatar
                    src={owner.avatar}
                    name={owner.username}
                    size={22}
                  />
                  <span className="font-semibold">@{owner.username}</span>
                </Link>
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
            {meta ? (
              <>
                <span aria-hidden>·</span>
                <span>{meta}</span>
              </>
            ) : null}
          </div>
          {description ? (
            <p className="clamp-2 mt-1.5 max-w-xl text-meta text-scrim-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2 sm:px-6">
      <div className="flex items-center gap-2">
        <h1 className="text-screen-title text-text-primary">{title}</h1>
        {isPrivate ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold text-text-secondary">
            <Icon name="lock" size={11} />
            Private
          </span>
        ) : null}
        {archived ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold text-text-secondary">
            Archived
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
        {owner ? (
          <>
            <Link
              href={`/u/${owner.username}`}
              className="flex items-center gap-1.5 hover:opacity-80"
            >
              <Avatar src={owner.avatar} name={owner.username} size={20} />
              <span className="font-semibold text-text-secondary">
                @{owner.username}
              </span>
            </Link>
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span className="tnum">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
        {meta ? (
          <>
            <span aria-hidden>·</span>
            <span>{meta}</span>
          </>
        ) : null}
      </div>
      {description ? (
        <p className="clamp-3 mt-2 max-w-xl text-body text-text-secondary">
          {description}
        </p>
      ) : null}
    </div>
  );
}
