'use client';

/**
 * LooksMoodboards — editorial band of authored Looks and member
 * moodboards. Cards lead with media; a bottom scrim carries the kind
 * kicker, serif title and one meta line (creator for looks, piece count
 * for moodboards). Snap-scroll rail on mobile, three-up grid from sm.
 */

import Link from 'next/link';
import type { Look, Moodboard } from '@/lib/contracts/domain';
import { LOOKS, MOODBOARDS, userById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { ModuleSection } from '@/components/home/modules/ModuleSection';

const cardClass =
  'pressable group relative block w-[220px] shrink-0 snap-start overflow-hidden rounded-xl sm:w-auto';

const scrimClass =
  'absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent';

function LookCard({ look }: { look: Look }) {
  const creator = userById(look.creatorId);
  const title = look.title ?? 'Look';
  return (
    <Link
      href={`/look/${look.id}`}
      role="listitem"
      aria-label={`${title} — look by @${creator?.username ?? 'member'}`}
      className={cardClass}
    >
      <AppImage
        src={look.coverImageUri}
        alt={title}
        aspectRatio={look.coverAspectRatio ?? 0.8}
        sizes="(max-width: 640px) 220px, 30vw"
        className="w-full"
        imgClassName="transition-transform duration-300 group-hover:scale-105"
      />
      <div className={scrimClass} />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <span className="text-label font-semibold uppercase tracking-wider text-scrim-text-secondary">
          Look
        </span>
        <h3 className="clamp-1 mt-0.5 text-editorial-title text-scrim-text-primary">
          {title}
        </h3>
        {creator ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Avatar src={creator.avatar} name={creator.username} size={18} />
            <span className="clamp-1 text-caption font-medium text-scrim-text-secondary">
              @{creator.username}
            </span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function MoodboardCard({ board }: { board: Moodboard }) {
  const pieces = board.itemCount ?? 0;
  return (
    <Link
      href={`/moodboard/${board.id}`}
      role="listitem"
      aria-label={`${board.title} — moodboard${pieces > 0 ? `, ${pieces} pieces` : ''}`}
      className={cardClass}
    >
      <AppImage
        src={board.coverUri}
        alt={board.title}
        aspectRatio={board.aspectRatio ?? 0.8}
        sizes="(max-width: 640px) 220px, 30vw"
        className="w-full"
        imgClassName="transition-transform duration-300 group-hover:scale-105"
      />
      <div className={scrimClass} />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <span className="text-label font-semibold uppercase tracking-wider text-scrim-text-secondary">
          Moodboard
        </span>
        <h3 className="clamp-1 mt-0.5 text-editorial-title text-scrim-text-primary">
          {board.title}
        </h3>
        {pieces > 0 ? (
          <p className="tnum mt-1.5 text-caption font-medium text-scrim-text-secondary">
            {pieces} piece{pieces === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function LooksMoodboards() {
  // Authored alternation: look → moodboard → look.
  const [firstLook, secondLook] = LOOKS;
  const board = MOODBOARDS[0];
  if (!firstLook && !board) return null;

  return (
    <ModuleSection title="Looks & moodboards">
      <div
        className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-6"
        role="list"
        aria-label="Looks and moodboards"
      >
        {firstLook ? <LookCard look={firstLook} /> : null}
        {board ? <MoodboardCard board={board} /> : null}
        {secondLook ? <LookCard look={secondLook} /> : null}
      </div>
    </ModuleSection>
  );
}
