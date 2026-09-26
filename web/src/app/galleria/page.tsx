'use client';

/**
 * Galleria — the editorial surface, orchestrator only.
 * Cover story hero → featured collections rail → issue table of contents →
 * featured pieces → back-issue archive. Serif + hairlines + space carry the
 * page; all surfaces live in components/galleria.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  GALLERIA_EDITORIALS,
  GALLERIA_FEATURED_COLLECTIONS,
  GALLERIA_FEATURED_ASSETS,
  GALLERIA_ARCHIVE,
  type GalleriaEditorial,
  type GalleriaFeaturedCollection,
} from '@/lib/data/fixtures-media';
import { listingById } from '@/lib/data/fixtures';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { GalleriaHero } from '@/components/galleria/GalleriaHero';
import { GalleriaSectionHeader } from '@/components/galleria/GalleriaSectionHeader';
import { GalleriaCollectionRail } from '@/components/galleria/GalleriaCollectionRail';
import { GalleriaEditorialList } from '@/components/galleria/GalleriaEditorialList';
import {
  GalleriaFeaturedAssets,
  type ResolvedGalleriaAsset,
} from '@/components/galleria/GalleriaFeaturedAssets';
import { GalleriaArchive } from '@/components/galleria/GalleriaArchive';
import { EditorialSheet, CollectionSheet } from '@/components/galleria/GalleriaSheets';
import { GalleriaSkeleton } from '@/components/galleria/GalleriaSkeleton';

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

function useGalleria() {
  return useQuery({
    queryKey: ['galleria'],
    queryFn: async () => {
      await tick();
      const assets: ResolvedGalleriaAsset[] = GALLERIA_FEATURED_ASSETS.flatMap((asset) => {
        const listing = listingById(asset.listingId);
        return listing ? [{ ...asset, listing }] : [];
      });
      return {
        cover: GALLERIA_EDITORIALS[0],
        editorials: GALLERIA_EDITORIALS.slice(1),
        collections: GALLERIA_FEATURED_COLLECTIONS,
        assets,
        archive: GALLERIA_ARCHIVE,
      };
    },
  });
}

type GalleriaSheetState =
  | { kind: 'editorial'; editorial: GalleriaEditorial }
  | { kind: 'collection'; collection: GalleriaFeaturedCollection }
  | null;

export default function GalleriaPage() {
  const { data, isLoading, isError, refetch } = useGalleria();
  const [sheet, setSheet] = useState<GalleriaSheetState>(null);

  if (isLoading) return <GalleriaSkeleton />;

  if (isError || !data) {
    return (
      <EmptyState
        icon="image"
        title="Galleria unavailable"
        subtitle="The editorial desk couldn't be reached. Try again in a moment."
        actionLabel="Retry"
        onAction={() => void refetch()}
      />
    );
  }

  const openEditorial = (editorial: GalleriaEditorial) =>
    setSheet({ kind: 'editorial', editorial });
  const openCollection = (collection: GalleriaFeaturedCollection) =>
    setSheet({ kind: 'collection', collection });
  const closeSheet = () => setSheet(null);

  return (
    <div className="pb-20">
      {data.cover ? (
        <GalleriaHero editorial={data.cover} onOpen={openEditorial} />
      ) : null}

      <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6">
        {/* Featured collections band */}
        <section aria-label="Featured collections" className="mt-14 md:mt-20">
          <GalleriaSectionHeader
            eyebrow="The edit"
            title="Collections"
            aside={
              <span className="flex items-center gap-1.5">
                <Icon name="layers" size={13} />
                Curated weekly
              </span>
            }
          />
          <GalleriaCollectionRail collections={data.collections} onOpen={openCollection} />
        </section>

        {/* Issue table of contents */}
        <section aria-label="In this issue" className="mt-14 md:mt-20">
          <GalleriaSectionHeader
            eyebrow={data.cover?.issueLabel ?? 'This issue'}
            title="In this issue"
            aside={`${data.editorials.length} ${data.editorials.length === 1 ? 'story' : 'stories'}`}
          />
          {data.editorials.length > 0 ? (
            <GalleriaEditorialList editorials={data.editorials} onOpen={openEditorial} />
          ) : (
            <EmptyState
              compact
              icon="document"
              title="No stories in this issue yet"
              subtitle="The desk is still writing — check back soon."
            />
          )}
        </section>

        {/* Featured pieces */}
        <section aria-label="Featured pieces" className="mt-14 md:mt-20">
          <GalleriaSectionHeader
            eyebrow="The objects"
            title="Featured pieces"
            aside="Live listings"
          />
          <GalleriaFeaturedAssets assets={data.assets} />
        </section>

        {/* Back-issue archive */}
        <section aria-label="Archive" className="mt-14 md:mt-20">
          <GalleriaSectionHeader eyebrow="Back issues" title="The archive" />
          <GalleriaArchive issues={data.archive} />
        </section>
      </div>

      <EditorialSheet
        editorial={sheet?.kind === 'editorial' ? sheet.editorial : null}
        onClose={closeSheet}
      />
      <CollectionSheet
        collection={sheet?.kind === 'collection' ? sheet.collection : null}
        onClose={closeSheet}
      />
    </div>
  );
}
