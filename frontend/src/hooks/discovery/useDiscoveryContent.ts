import { useCallback, useEffect, useState } from 'react';

import { fetchLooksFromApi, type LookApiItem } from '../../services/looksApi';
import { fetchPosterStories, type PosterStory } from '../../services/postersApi';
import { fetchPublicMoodboards, type Moodboard } from '../../services/moodboardApi';
import {
  fetchGalleriaCollections,
  fetchGalleriaEditorials,
  type GalleriaCollection,
  type GalleriaEditorial } from '../../services/galleriaApi';

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

  // ── Load all discovery content ──
  const loadDiscoveryContent = useCallback(async () => {
    setIsDiscoveryLoading(true);
    setDiscoveryError(null);
    const [looksRes, postersRes, moodboardsRes, colsRes, edsRes] = await Promise.allSettled([
      fetchLooksFromApi({ status: 'published', sort: 'foryou', limit: 6 }),
      fetchPosterStories({ active: true, limit: 4 }),
      fetchPublicMoodboards(),
      fetchGalleriaCollections(),
      fetchGalleriaEditorials(),
    ]);

    let fulfilled = 0;
    if (looksRes.status === 'fulfilled') { setLooks(looksRes.value.items ?? []); fulfilled++; }
    if (postersRes.status === 'fulfilled') { setPosters(postersRes.value.items ?? []); fulfilled++; }
    if (moodboardsRes.status === 'fulfilled') {
      setMoodboards(moodboardsRes.value.filter((m) => !m.isDemo));
      fulfilled++;
    }
    if (colsRes.status === 'fulfilled') { setCollections(colsRes.value); fulfilled++; }
    if (edsRes.status === 'fulfilled') { setEditorials(edsRes.value); fulfilled++; }

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
    loadDiscoveryContent,
  };
}
