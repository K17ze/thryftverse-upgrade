'use client';

/**
 * useTaxonomy — canonical picker vocabulary for the sell flow. Mirrors the
 * mobile TaxonomyContext contract: components read the seed immediately and
 * live mode swaps in GET /taxonomy once it resolves. Fixture mode never
 * touches the network — the seed IS the taxonomy there.
 *
 * The resolved collection is cached module-wide so every composer surface
 * (Details pickers, review, preview) sees the same vocabulary without a
 * provider or a fetch per mount.
 */

import { useEffect, useState } from 'react';
import { TAXONOMY_SEED, type TaxonomyCollection } from '@/lib/contracts/taxonomy';
import { DATA_MODE } from '@/lib/api/client';
import { fetchTaxonomy } from '@/lib/api/services/taxonomy';

let resolved: TaxonomyCollection | null = null;
let inflight: Promise<TaxonomyCollection> | null = null;

function loadTaxonomy(): Promise<TaxonomyCollection> {
  inflight ??= fetchTaxonomy().then((collection) => {
    resolved = collection;
    return collection;
  });
  return inflight;
}

export interface UseTaxonomyResult {
  taxonomy: TaxonomyCollection;
  /** True while the first live fetch is in flight — seed is already applied. */
  isLoading: boolean;
}

export function useTaxonomy(): UseTaxonomyResult {
  const [taxonomy, setTaxonomy] = useState<TaxonomyCollection>(
    resolved ?? TAXONOMY_SEED,
  );
  const [isLoading, setIsLoading] = useState(
    DATA_MODE === 'live' && resolved === null,
  );

  useEffect(() => {
    if (DATA_MODE !== 'live' || resolved) return;
    let mounted = true;
    void loadTaxonomy().then((collection) => {
      if (!mounted) return;
      setTaxonomy(collection);
      setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { taxonomy, isLoading };
}
