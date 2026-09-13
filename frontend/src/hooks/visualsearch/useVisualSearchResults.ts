import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import type { Listing } from '../../domain';
import { visualSearch } from '../../services/listingsApi';
import type {
  ResultStatus,
  VisualSearchFacetCounts,
  VisualSearchFilterPayload } from '../../components/visualsearch/visualSearchTypes';

interface Params {
  imageUri: string | null;
  buildFilterPayload: () => VisualSearchFilterPayload;
  filterCachedListings: (payload: VisualSearchFilterPayload) => Listing[];
}

// Search-in-flight domain for VisualSearchScreen: status machine, result set,
// facet counts, honest-match metadata and pull-to-refresh. Runs the backend
// visual search with a monotonic sequence + AbortController so a newer
// crop/filter/refresh can never be overwritten by a stale response, and falls
// back to client-side filtering of cached listings on failure.
export function useVisualSearchResults({ imageUri, buildFilterPayload, filterCachedListings }: Params) {
  const [status, setStatus] = useState<ResultStatus>('idle');
  const [results, setResults] = useState<Listing[]>([]);
  const [facetCounts, setFacetCounts] = useState<VisualSearchFacetCounts>(null);
  const [visualMatching, setVisualMatching] = useState(false);
  const [similarityMethod, setSimilarityMethod] = useState<string | undefined>(undefined);
  const [resultNote, setResultNote] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // ── Request sequencing ──────────────────────────────────────────────
  // Monotonic sequence counter ensures a newer crop/filter/refresh request
  // can never be overwritten by a stale response from an older one. Each
  // runSearch increments the counter and captures its sequence number; only
  // the response matching the latest sequence is applied to state.
  // An AbortController cancels the in-flight HTTP request when a newer
  // search starts, so stale fetches don't consume bandwidth or race.
  const requestSequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Read a local image URI as a base64 string for the backend. Remote/data
  // URIs are passed through as-is via imageUrl where possible. Returns null
  // when the file cannot be read (the backend then falls back to filter-only).
  const readImageAsBase64 = useCallback(async (uri: string): Promise<string | null> => {
    if (/^data:/i.test(uri)) {
      return uri;
    }
    if (/^https?:/i.test(uri)) {
      return null;
    }
    try {
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64 });
    } catch {
      return null;
    }
  }, []);

  // Run the visual search: prefer the backend, fall back to cached listings.
  // Uses a monotonic sequence + AbortController so a newer request never gets
  // overwritten by a stale response from an older one. Sets 'error' state
  // when the backend call fails AND the client-side fallback also produces
  // nothing — the error state was previously unreachable.
  const runSearch = useCallback(async () => {
    if (!imageUri) return;
    // Cancel any in-flight request from a previous search.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const mySequence = ++requestSequenceRef.current;
    setStatus('loading');
    const payload = buildFilterPayload();

    const isRemote = /^https?:/i.test(imageUri);
    const imageBase64 = isRemote ? null : await readImageAsBase64(imageUri);
    let apiResult;
    try {
      apiResult = await visualSearch({
        ...payload,
        imageBase64: imageBase64 ?? undefined,
        imageUrl: isRemote ? imageUri : undefined,
        signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!isMountedRef.current || mySequence !== requestSequenceRef.current) return;
      // Network/parse failure — try cached listings before declaring error.
      setFacetCounts(null);
      const cached = filterCachedListings(payload);
      if (cached.length > 0) {
        setResults(cached);
        setVisualMatching(false);
        setSimilarityMethod('filter_only');
        setResultNote('Showing matches from your filters (offline).');
        setStatus('offline');
      } else {
        setStatus('error');
      }
      return;
    }

    // Drop stale responses — a newer crop/filter/refresh may have started.
    if (!isMountedRef.current || mySequence !== requestSequenceRef.current) return;

    let items: Listing[] = apiResult.listings;
    let usedFallback = apiResult.source === 'fallback';

    if (apiResult.source === 'fallback' || items.length === 0) {
      const cached = filterCachedListings(payload);
      if (cached.length > 0) {
        items = cached;
        usedFallback = true;
      }
    }

    // If the backend returned an explicit error AND no items AND the cached
    // fallback also produced nothing, show the error state — not empty.
    if (apiResult.error && items.length === 0 && !usedFallback) {
      setStatus('error');
      return;
    }

    // F08: Facets are retrieval-scoped — the backend already narrowed the
    // candidate set using the facet parameters in `payload.facets`, so no
    // client-side post-filter is applied here. An empty `items` now means
    // "no listings match this facet scope" — the honest empty state.
    setFacetCounts(
      apiResult.facets
        ? {
            colors: Object.fromEntries(apiResult.facets.colors.map((f) => [f.value, f.count])),
            styles: Object.fromEntries(apiResult.facets.styles.map((f) => [f.value, f.count])),
          }
        : null,
    );

    setResults(items);
    setVisualMatching(apiResult.visualMatching);
    setSimilarityMethod(apiResult.similarityMethod);
    setResultNote(
      usedFallback && !apiResult.visualMatching
        ? 'Showing matches from your category, brand, and description filters.'
        : apiResult.note
    );
    const isPartial = usedFallback && (!!apiResult.error || apiResult.source === 'fallback');
    setStatus(items.length > 0 ? (isPartial ? 'partial' : 'populated') : 'empty');
  }, [imageUri, buildFilterPayload, filterCachedListings, readImageAsBase64]);

  const handleRefresh = useCallback(async () => {
    if (!imageUri) return;
    setRefreshing(true);
    await runSearch();
    setTimeout(() => { if (isMountedRef.current) setRefreshing(false); }, 400);
  }, [imageUri, runSearch]);

  // Resets the result surface for "remove photo and start over". Mirrors the
  // pre-extraction reset exactly — similarityMethod/resultNote are left
  // untouched (status returns to 'idle' so they are never rendered).
  const resetResults = useCallback(() => {
    setStatus('idle');
    setResults([]);
    setFacetCounts(null);
  }, []);

  // ── Honest integrated note ────────────────────────────────────────────
  // Labels the matching method truthfully. Never claims AI/ML when the
  // backend used a deterministic colour-and-layout heuristic.
  const honestNoteText = useMemo(() => {
    if (similarityMethod === 'heuristic_color_features') {
      return 'Results matched by colour similarity (heuristic, not AI).';
    }
    if (similarityMethod === 'filter_only') {
      return resultNote ?? 'Results matched by category, brand & description.';
    }
    return resultNote;
  }, [similarityMethod, resultNote]);

  return {
    status,
    results,
    facetCounts,
    visualMatching,
    similarityMethod,
    refreshing,
    runSearch,
    handleRefresh,
    resetResults,
    honestNoteText };
}
