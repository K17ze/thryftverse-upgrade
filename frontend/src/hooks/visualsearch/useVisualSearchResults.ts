import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import type { Listing } from '../../domain';
import { visualSearch } from '../../services/listingsApi';
import type {
  ResultStatus,
  VisualSearchFacetCounts,
  VisualSearchFilterPayload,
  VisualSearchRegion } from '../../components/visualsearch/visualSearchTypes';

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

  // ── R24 region-of-interest ────────────────────────────────────────
  // The rect the user framed on the query image (normalised [0,1]
  // fractions) — null means whole-image search. `region` is render state
  // for the query header/crop overlay; `regionRef` is the value runSearch
  // actually sends, so an applyRegion→re-run in the same commit can never
  // dispatch a stale crop.
  const [region, setRegionState] = useState<VisualSearchRegion | null>(null);
  const regionRef = useRef<VisualSearchRegion | null>(null);
  // Server-truth disclosure: 'region' only when the backend confirms the
  // crop actually ran — never inferred from the client-side region alone.
  const [queryScope, setQueryScope] = useState<'whole_image' | 'region' | undefined>(undefined);

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
  // Invalidate any in-flight request: abort the HTTP call AND advance the
  // epoch so even a response that already resolved past the network layer
  // can never pass the sequence check and repopulate state. Called on
  // reset, image removal/replacement and unmount — the three moments the
  // pending request's subject stops being valid.
  const invalidatePendingSearch = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestSequenceRef.current += 1;
  }, []);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      invalidatePendingSearch();
    };
  }, [invalidatePendingSearch]);

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
        // R24: sent only when the user confirmed a crop — null/undefined
        // means the backend scores the whole frame.
        region: regionRef.current ?? undefined,
        signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!isMountedRef.current || mySequence !== requestSequenceRef.current) return;
      // Network/parse failure — try cached listings before declaring error.
      setFacetCounts(null);
      setQueryScope(undefined);
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
    // S20-02: provenance travels WITH the displayed collection. The API's
    // retrieval claims (visualMatching / similarityMethod / queryScope /
    // facet counts) describe `apiResult.listings` only — when the
    // client-side cache supplies the displayed set instead, attaching those
    // claims to it would fabricate a visual/region match that never ran.
    let itemsFromCache = false;
    if (apiResult.source === 'fallback' || items.length === 0) {
      const cached = filterCachedListings(payload);
      if (cached.length > 0) {
        items = cached;
        itemsFromCache = true;
      }
    }

    // If the backend returned an explicit error AND no items AND the cached
    // fallback also produced nothing, show the error state — not empty.
    if (apiResult.error && items.length === 0 && !itemsFromCache) {
      setStatus('error');
      return;
    }

    // F08: Facets are retrieval-scoped — the backend already narrowed the
    // candidate set using the facet parameters in `payload.facets`, so no
    // client-side post-filter is applied here. An empty `items` now means
    // "no listings match this facet scope" — the honest empty state.
    // The counts only travel with the API's own candidate set; a cached
    // substitution gets none, since they describe a different collection.
    setFacetCounts(
      !itemsFromCache && apiResult.facets
        ? {
            colors: Object.fromEntries(apiResult.facets.colors.map((f) => [f.value, f.count])),
            styles: Object.fromEntries(apiResult.facets.styles.map((f) => [f.value, f.count])),
          }
        : null,
    );

    setResults(items);
    setVisualMatching(itemsFromCache ? false : apiResult.visualMatching);
    setSimilarityMethod(itemsFromCache ? 'filter_only' : apiResult.similarityMethod);
    setQueryScope(itemsFromCache ? undefined : apiResult.retrievalMeta?.queryScope);
    setResultNote(
      itemsFromCache
        ? 'Showing matches from your category, brand, and description filters.'
        : apiResult.note
    );
    // Any cache substitution means the visible results are saved-data
    // matches, not the retrieval the API reported — the 'partial' banner
    // ("Some results from your saved data") is the honest state for them.
    setStatus(items.length > 0 ? (itemsFromCache ? 'partial' : 'populated') : 'empty');
  }, [imageUri, buildFilterPayload, filterCachedListings, readImageAsBase64]);

  const handleRefresh = useCallback(async () => {
    if (!imageUri) return;
    setRefreshing(true);
    await runSearch();
    setTimeout(() => { if (isMountedRef.current) setRefreshing(false); }, 400);
  }, [imageUri, runSearch]);

  // R24: confirm or clear the framed region. The region ref is written
  // synchronously and the search re-runs immediately — a state-driven
  // effect would dispatch with the pre-commit region value.
  const applyRegion = useCallback((next: VisualSearchRegion | null) => {
    regionRef.current = next;
    setRegionState(next);
    if (imageUri && status !== 'idle') void runSearch();
  }, [imageUri, status, runSearch]);

  // Resets the result surface for "remove photo and start over". S20-01:
  // invalidating BEFORE clearing is the actual reset — aborting the
  // in-flight controller and advancing the epoch is what stops a late
  // response from the removed image repopulating results afterwards.
  const resetResults = useCallback(() => {
    invalidatePendingSearch();
    setStatus('idle');
    setResults([]);
    setFacetCounts(null);
    setVisualMatching(false);
    setSimilarityMethod(undefined);
    setResultNote(undefined);
    regionRef.current = null;
    setRegionState(null);
    setQueryScope(undefined);
  }, [invalidatePendingSearch]);

  // A new photo invalidates any framed region — its coordinates describe
  // the previous image — AND any pending request: a response from the old
  // photo must never land under the new one even if it resolves first
  // (S20-01, identity change). The image change also re-runs the
  // whole-image search whenever results were already showing: the screen's
  // auto-run effect only covers the first capture (status 'idle'), so
  // without this a retake/replace would leave stale results under the new
  // photo. Removing the image entirely (null) invalidates the pending
  // request and leaves the surface idle with no stale results/facets/scope.
  const prevImageUriRef = useRef(imageUri);
  useEffect(() => {
    const prev = prevImageUriRef.current;
    prevImageUriRef.current = imageUri;
    if (prev === imageUri) return;
    if (!imageUri) {
      resetResults();
      return;
    }
    invalidatePendingSearch();
    regionRef.current = null;
    setRegionState(null);
    setQueryScope(undefined);
    if (status !== 'idle') {
      void runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- status/runSearch are intentionally read from this render only; depending on them would retrigger the search on unrelated state changes.
  }, [imageUri, resetResults, invalidatePendingSearch]);

  // ── Honest integrated note ────────────────────────────────────────────
  // Labels the matching method truthfully. Never claims AI/ML when the
  // backend used a deterministic colour-and-layout heuristic.
  const honestNoteText = useMemo(() => {
    if (similarityMethod === 'heuristic_color_features') {
      // R24: only claim region scoping when the backend confirmed the crop
      // ran — a degenerate region falls back to whole-image scoring.
      return queryScope === 'region'
        ? 'Results matched by colour similarity within the framed area (heuristic, not AI).'
        : 'Results matched by colour similarity (heuristic, not AI).';
    }
    if (similarityMethod === 'filter_only') {
      return resultNote ?? 'Results matched by category, brand & description.';
    }
    return resultNote;
  }, [similarityMethod, resultNote, queryScope]);

  return {
    status,
    results,
    facetCounts,
    visualMatching,
    similarityMethod,
    refreshing,
    region,
    queryScope,
    applyRegion,
    runSearch,
    handleRefresh,
    resetResults,
    honestNoteText };
}
