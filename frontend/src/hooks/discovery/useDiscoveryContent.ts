import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchLooksFromApi, type LookApiItem } from '../../services/looksApi';
import { fetchPosterStories, type PosterStory } from '../../services/postersApi';
import { fetchPublicMoodboards, type Moodboard } from '../../services/moodboardApi';
import {
  fetchGalleriaCollections,
  fetchGalleriaEditorials,
  type GalleriaCollection,
  type GalleriaEditorial } from '../../services/galleriaApi';

/** Identity of each independently-loaded discovery module. The feed view
 *  uses this to render a restrained inline retry at the failed module's own
 *  position — never a generic note over healthy modules (FRESH-10). */
export type DiscoveryModuleId =
  | 'looks'
  | 'posters'
  | 'moodboards'
  | 'collections'
  | 'editorials';

/**
 * Loads the editorial discovery modules — looks, poster stories, public
 * moodboards, curated collections and editorials — with a Promise.allSettled
 * fan-out: every source is independent, and only a total failure surfaces
 * the discovery-level error state.
 */
export function useDiscoveryContent() {
  const [looks, setLooks] = useState<LookApiItem[]>([]);
  const [posters, setPosters] = useState<PosterStory[]>([]);
  const [moodboards, setMoodboards] = useState<Moodboard[]>([]);
  const [collections, setCollections] = useState<GalleriaCollection[]>([]);
  const [editorials, setEditorials] = useState<GalleriaEditorial[]>([]);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  // Per-module freshness (F21/FRESH-10): modules that rejected their last
  // refresh, by identity. Their previous data stays visible, but the surface
  // must attribute the failure to the module — not a generic note.
  const [staleModules, setStaleModules] = useState<DiscoveryModuleId[]>([]);

  // ── Request identity (FRESH-02) ──
  // Monotonic epoch bumped on every load — the mount effect and
  // pull-to-refresh (UnifiedDiscoveryScreen.handleRefresh) can overlap,
  // and a stale load's writes must never overwrite fresher module data,
  // re-mark just-refreshed modules as stale, or clear isDiscoveryLoading
  // while a newer load is still in flight. Same convention as
  // useDiscoverySearch (searchEpochRef) and useForYouFeed (feedEpochRef).
  const loadEpochRef = useRef(0);

  // ── Load all discovery content ──
  const loadDiscoveryContent = useCallback(async () => {
    const epoch = ++loadEpochRef.current;
    setIsDiscoveryLoading(true);
    setDiscoveryError(null);
    const [looksRes, postersRes, moodboardsRes, colsRes, edsRes] = await Promise.allSettled([
      fetchLooksFromApi({ status: 'published', sort: 'foryou', limit: 6 }),
      fetchPosterStories({ active: true, limit: 4 }),
      fetchPublicMoodboards(),
      fetchGalleriaCollections(),
      fetchGalleriaEditorials(),
    ]);

    // A newer load was issued while this one was in flight — every write
    // below belongs to a dead identity and is dropped.
    if (epoch !== loadEpochRef.current) return;

    let fulfilled = 0;
    const stale: DiscoveryModuleId[] = [];
    if (looksRes.status === 'fulfilled') { setLooks(looksRes.value.items ?? []); fulfilled++; } else { stale.push('looks'); }
    if (postersRes.status === 'fulfilled') { setPosters(postersRes.value.items ?? []); fulfilled++; } else { stale.push('posters'); }
    if (moodboardsRes.status === 'fulfilled') {
      setMoodboards(moodboardsRes.value.filter((m) => !m.isDemo));
      fulfilled++;
    } else { stale.push('moodboards'); }
    if (colsRes.status === 'fulfilled') { setCollections(colsRes.value); fulfilled++; } else { stale.push('collections'); }
    if (edsRes.status === 'fulfilled') { setEditorials(edsRes.value); fulfilled++; } else { stale.push('editorials'); }
    setStaleModules(stale);

    // If every discovery endpoint failed, surface an error state.
    if (fulfilled === 0) {
      setDiscoveryError('Discovery content is temporarily unavailable.');
    }
    setIsDiscoveryLoading(false);
  }, []);

  useEffect(() => {
    void loadDiscoveryContent();
  }, [loadDiscoveryContent]);

  return {
    looks,
    posters,
    moodboards,
    collections,
    editorials,
    isDiscoveryLoading,
    discoveryError,
    staleModules,
    loadDiscoveryContent,
  };
}
