'use client';

import { useMemo } from 'react';
import type { Listing, User } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import {
  ClosetMediaMosaic,
  closetMosaicCells,
  CLOSET_MOSAIC_MIN,
} from '@/components/closet/ClosetMediaMosaic';

interface ProfileCoverBandProps {
  user: User;
  closetMedia?: Listing[];
  listingCount?: number;
}

export function ProfileCoverBand({ user, closetMedia, listingCount }: ProfileCoverBandProps) {
  const mosaicCells = useMemo(() => closetMosaicCells(closetMedia ?? []), [closetMedia]);
  const hasCoverMedia = Boolean(user.coverPhoto || user.coverVideo);
  const showMosaic = !hasCoverMedia && mosaicCells.length >= CLOSET_MOSAIC_MIN;

  if (hasCoverMedia) {
    return (
      <div className="relative left-1/2 h-36 w-screen -translate-x-1/2 overflow-hidden sm:h-48 lg:h-64 xl:h-72">
        {/* Contained-crop art direction: portrait covers keep the
            upper-third subject instead of a dead-centre slice. Scoped
            to lg+ so the mobile crop stays untouched. */}
        {user.coverPhoto ? (
          <AppImage
            src={user.coverPhoto}
            alt=""
            fill
            sizes="100vw"
            imgClassName="lg:object-[50%_35%]"
            className="h-full w-full"
            priority
          />
        ) : null}
        {/* Cover video — muted ambient loop layered over the photo,
            which stays mounted as poster + load-error fallback
            (mobile FlagshipProfileMedia coverVideoUri grammar). */}
        {user.coverVideo ? (
          <video
            src={user.coverVideo}
            poster={user.coverPhoto}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover lg:object-[50%_35%]"
          />
        ) : null}
        {/* Media scrims — top fade for floating-control contrast, bottom
            fade softens the avatar seam (mobile ProfileHeaderHero grammar). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/10 to-transparent"
        />
      </div>
    );
  }

  if (showMosaic) {
    return (
      <ClosetMediaMosaic
        cells={mosaicCells}
        ownerId={user.id}
        username={user.username}
        itemCount={listingCount ?? user.listingCount}
      />
    );
  }

  return null;
}
