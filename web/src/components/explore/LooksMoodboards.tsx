'use client';

/**
 * LooksMoodboards — editorial band of authored Looks and member
 * moodboards. Cards lead with media; a bottom scrim carries the kind
 * kicker, serif title and one meta line (creator for looks, piece count
 * for moodboards). Snap-scroll rail on mobile, three-up grid from sm.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Look, Moodboard } from '@/lib/contracts/domain';
import { LOOKS, MOODBOARDS, userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { fetchLooks, fetchMoodboards, type LookWithCounts } from '@/lib/api/services/social';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { ModuleSection } from '@/components/home/modules/ModuleSection';

const LIVE = DATA_MODE === 'live';

/** Normalized creator — live look rows carry the backend's creator
 *  summary; fixture rows resolve through USERS. */
function lookCreator(look: Look | LookWithCounts) {
  if (!LIVE) {
    const u = userById(look.creatorId);
    return u ? { name: `@${u.username}`, avatar: u.avatar } : null;
  }
  const c = (look as LookWithCounts).creator;
  if (!c?.username) return null;
  return { name: `@${c.username}`, avatar: c.avatar };
}

const cardClass =
  'pressable group relative block w-[220px] shrink-0 snap-start overflow-hidden rounded-xl sm:w-auto';

const scrimClass =
  'absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent';

function LookCard({ look }: { look: Look | LookWithCounts }) {
  const creator = lookCreator(look);
  const title = look.title ?? 'Look';
  return (
    <Link
      href={`/look/${look.id}`}
      role="listitem"
      aria-label={`${title} — look by ${creator?.name ?? 'member'}`}
      className={cardClass}
    >
      <AppImage
        src={look.coverImageUri}
        alt={title}
        aspectRatio={look.coverAspectRatio ?? 0.8}
        sizes="(max-width: 640px) 220px, 30vw"
        className="w-full media-zoom"
      />
      <div className={scrimClass} />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <span className="text-label text-scrim-text-secondary">
          Look
        </span>
        <h3 className="clamp-1 mt-0.5 text-editorial-title text-scrim-text-primary">
          {title}
        </h3>
        {creator ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Avatar src={creator.avatar} name={creator.name} size={18} />
            <span className="clamp-1 text-caption font-medium text-scrim-text-secondary">
              {creator.name}
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
        className="w-full media-zoom"
      />
      <div className={scrimClass} />
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        <span className="text-label text-scrim-text-secondary">
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
  // Live: authored band composed of real looks + real public boards —
  // the same feeds mobile's editorial band consumes. Public endpoints,
  // so guests see them too; on failure the band hides rather than
  // fabricating a member's work.
  const looksQuery = useQuery({
    queryKey: ['explore', 'looks', 'band'],
    queryFn: ({ signal }) => fetchLooks({ sort: 'foryou', limit: 2 }, signal),
    enabled: LIVE,
    staleTime: 5 * 60_000,
  });
  const boardsQuery = useQuery({
    queryKey: ['explore', 'moodboards', 'band'],
    queryFn: ({ signal }) => fetchMoodboards(signal),
    enabled: LIVE,
    staleTime: 5 * 60_000,
  });

  const looks = LIVE ? (looksQuery.data ?? []) : LOOKS;
  const boards = LIVE
    ? (boardsQuery.data ?? []).filter((b) => b.coverUri)
    : MOODBOARDS;

  // Authored alternation: look → moodboard → look.
  const [firstLook, secondLook] = looks;
  const board = boards[0];
  if (LIVE && (looksQuery.isLoading || boardsQuery.isLoading)) return null;
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
