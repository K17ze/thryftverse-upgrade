'use client';

/**
 * GroupAvatarMosaic — web port of the mobile component: composites 2–4
 * member avatars into a 2×2 grid that fills the group avatar circle.
 * An uploaded group photo takes precedence; fewer than 2 avatar-bearing
 * members falls back to initials on a deterministic per-group color.
 */

import { AppImage } from '@/components/ui/AppImage';

/** Staged picker URIs (blob:/data:) can't route through next/image — same
 *  guard as MessageBubble/EditGroupSheet. */
const isLocalUri = (uri: string) => uri.startsWith('blob:') || uri.startsWith('data:');

export interface MosaicMember {
  id: string;
  displayName?: string | null;
  avatar?: string | null;
}

/** Telegram/WhatsApp pattern — stable colour per id (FNV-1a), every fill
 *  has ≥3:1 contrast against white initials. Mirrors AVATAR_PALETTE. */
const AVATAR_PALETTE = [
  '#E5484D',
  '#F5A623',
  '#46A758',
  '#0EA5E9',
  '#6366F1',
  '#A855F7',
  '#EC4899',
  '#14B8A6',
] as const;

function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function colorForId(seed: string): string {
  return AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'G'
  );
}

interface GroupAvatarMosaicProps {
  members: MosaicMember[];
  size?: number;
  /** Uploaded group photo — wins over the mosaic. */
  groupPhoto?: string | null;
  /** Fallback name for initials when members carry no usable names. */
  fallbackName?: string;
  /** Stable id (conversation id) — seeds the deterministic colour. */
  groupId?: string;
  className?: string;
}

export function GroupAvatarMosaic({
  members,
  size = 40,
  groupPhoto,
  fallbackName = 'Group',
  groupId,
  className = '',
}: GroupAvatarMosaicProps) {
  const overflowCount = Math.max(0, members.length - 4);

  if (groupPhoto) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        {isLocalUri(groupPhoto) ? (
          // eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable
          <img src={groupPhoto} alt="Group photo" className="h-full w-full object-cover" />
        ) : (
          <AppImage
            src={groupPhoto}
            alt="Group photo"
            fill
            sizes={`${size}px`}
            className="h-full w-full"
          />
        )}
      </div>
    );
  }

  const withAvatars = members.filter((m) => m.avatar).slice(0, 4);
  const initialsSource = members[0]?.displayName ?? fallbackName;

  // 0–1 avatars → initials on the deterministic group colour.
  if (withAvatars.length < 2) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: colorForId(groupId ?? members[0]?.id ?? fallbackName),
        }}
        role="img"
        aria-label={`Group avatar, ${initialsOf(initialsSource)}`}
      >
        <span
          className="font-bold text-white"
          style={{ fontSize: Math.round(size * 0.36), letterSpacing: '-0.5px' }}
        >
          {initialsOf(initialsSource)}
        </span>
      </div>
    );
  }

  // 2–4 avatars → 2×2 grid, hairline separators between cells.
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-surface-alt ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Group avatar, ${members.length} members`}
    >
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
        {withAvatars.map((m) => (
          <AppImage
            key={m.id}
            src={m.avatar}
            alt={m.displayName ?? 'Member'}
            fill
            sizes={`${Math.ceil(size / 2)}px`}
            className="h-full w-full"
          />
        ))}
      </div>
      {overflowCount > 0 ? (
        <span
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full bg-overlay px-1 font-semibold text-scrim-text-primary"
          style={{
            minWidth: size * 0.36,
            height: size * 0.36,
            fontSize: Math.max(9, Math.round(size * 0.22)),
          }}
        >
          +{overflowCount}
        </span>
      ) : null}
    </div>
  );
}
