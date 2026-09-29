'use client';

/**
 * Galleria — the editorial surface, orchestrator only.
 * Cover story hero → featured collections rail → issue table of contents →
 * featured pieces → back-issue archive. Serif + hairlines + space carry the
 * page; all surfaces live in components/galleria.
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  GALLERIA_EDITORIALS,
  GALLERIA_FEATURED_COLLECTIONS,
  GALLERIA_FEATURED_ASSETS,
  GALLERIA_ARCHIVE,
  type GalleriaEditorial,
  type GalleriaFeaturedCollection,
} from '@/lib/data/fixtures-media';
import { listingById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as galleriaService from '@/lib/api/services/galleria';
import * as listingsService from '@/lib/api/services/listings';
import { useSession } from '@/lib/session/SessionProvider';
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
import { GalleriaSkeleton } from '@/components/galleria/GalleriaSkeleton';

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

const isLive = DATA_MODE === 'live';

function useGalleria(enabled: boolean) {
  return useQuery({
    queryKey: ['galleria'],
    enabled,
    queryFn: async ({ signal }) => {
      if (isLive) {
        const [editorials, collections, assetPairs] = await Promise.all([
          galleriaService.fetchGalleriaEditorials(signal),
          galleriaService.fetchGalleriaCollections(signal),
          galleriaService.fetchGalleriaFeaturedAssets(signal),
        ]);
        // Real listing resolution — items only reach the rail when the
        // backend links them to a live listing.
        const resolved = await Promise.all(
          assetPairs.map(async ({ item, collectionTitle }) => {
            if (!item.listingId) return null;
            const listing = await listingsService
              .fetchListingById(item.listingId, signal)
              .catch(() => null);
            return listing
              ? ({
                  listingId: item.listingId,
                  fromCollection: collectionTitle,
                  note: item.story || item.title,
                  listing,
                } satisfies ResolvedGalleriaAsset)
              : null;
          }),
        );
        return {
          cover: editorials[0],
          editorials: editorials.slice(1),
          collections,
          assets: resolved.filter((a): a is ResolvedGalleriaAsset => a != null),
          // No back-issue archive endpoint exists — the archive section is
          // fixture-scope only, so live mode resolves to an empty list.
          archive: [],
        };
      }
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

export default function GalleriaPage() {
  const router = useRouter();
  const { sessionLoading } = useSession();
  // /galleria/* GETs are public server-side and native shows the hub to
  // guests — no member wall here.
  const { data, isLoading, isError, error, refetch } = useGalleria(true);

  if (isLoading || (isLive && sessionLoading)) return <GalleriaSkeleton />;

  if (isError && parseApiError(error).status === 401) {
    return (
      <EmptyState
        icon="lock"
        title="The Galleria is for members"
        subtitle="Sign in to read the current issue and browse the curated edits."
        actionLabel="Sign in"
        onAction={() => router.push('/auth/login')}
      />
    );
  }

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

  // Stories and edits are full routes — the hub deep-links into them.
  const openEditorial = (editorial: GalleriaEditorial) =>
    router.push(`/galleria/editorial/${editorial.id}`);
  const openCollection = (collection: GalleriaFeaturedCollection) =>
    router.push(`/galleria/collection/${collection.id}`);

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

        {/* Back-issue archive — fixture-scope only; live mode has no
            back-issue endpoint, so the section drops rather than show a
            heading over nothing. */}
        {data.archive.length > 0 ? (
          <section aria-label="Archive" className="mt-14 md:mt-20">
            <GalleriaSectionHeader eyebrow="Back issues" title="The archive" />
            <GalleriaArchive issues={data.archive} />
          </section>
        ) : null}

        {!isLive ? (
          <p className="mt-14 flex items-center gap-1.5 text-caption text-text-muted md:mt-20">
            <Icon name="info" size={14} className="shrink-0" />
            Preview issue — stories and collections ship as bundled editorial
            content in this build.
          </p>
        ) : null}
      </div>
    </div>
  );
}
