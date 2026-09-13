import { useCallback, useEffect, useState } from 'react';

import {
  fetchGalleriaCollections,
  fetchGalleriaEditorials,
  fetchFeaturedAssets,
  type GalleriaCollection,
  type GalleriaEditorial,
  type GalleriaFeaturedAsset } from '../../services/galleriaApi';
import { useAppTranslation } from '../../i18n/useAppTranslation';

/**
 * Loads the Galleria surface content — curated collections, editorials and
 * featured Co-Own assets — with a single Promise.all fan-out, plus the
 * derived slices the screen composes (hero editorial, featured collection,
 * rail remainder).
 */
export function useGalleriaContent() {
  const { t } = useAppTranslation('galleria');

  const [collections, setCollections] = useState<GalleriaCollection[]>([]);
  const [editorials, setEditorials] = useState<GalleriaEditorial[]>([]);
  const [featuredAssets, setFeaturedAssets] = useState<GalleriaFeaturedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data loading ──
  const loadAll = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [cols, eds, assets] = await Promise.all([
        fetchGalleriaCollections(),
        fetchGalleriaEditorials(),
        fetchFeaturedAssets(),
      ]);
      setCollections(cols);
      setEditorials(eds);
      setFeaturedAssets(assets);
    } catch (e) {
      setError(t('error.loadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(false);
  }, [loadAll]);

  // ── Derived data ──
  const heroEditorial = editorials[0] ?? null;
  const remainingEditorials = editorials.slice(1);
  const featuredCollection = collections[0] ?? null;
  const railCollections = collections.slice(1);

  return {
    collections,
    editorials,
    featuredAssets,
    loading,
    refreshing,
    error,
    loadAll,
    heroEditorial,
    remainingEditorials,
    featuredCollection,
    railCollections };
}
