'use client';

/**
 * useVisualSearch — orchestration hook for /search/visual.
 * Web port of the mobile visualsearch hooks (useVisualSearchImage +
 * useVisualSearchResults) collapsed into one fixture-mode state machine:
 *
 *   idle → analyzing(reading → extracting → matching) → populated | empty | error
 *
 * Owns: the picked file + blob preview URL lifecycle (revoked on
 * replace/unmount), the decoded bitmap (reused across region re-runs), the
 * staged analysis pipeline, detected-attribute chips and the framed region.
 * Matching is deterministic and on-device — see visualSearchEngine.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import {
  decodeImage,
  detectAttributes,
  extractFeatures,
  matchListings,
  passesDetectedConstraints,
  passesManualFilters,
  type DecodedImage,
} from '@/components/visualsearch/visualSearchEngine';
import {
  ACCEPTED_IMAGE_TYPES,
  EMPTY_MANUAL_FILTERS,
  MAX_FILE_BYTES,
  type AnalysisPhase,
  type DetectedAttribute,
  type ImageFeatures,
  type VisualSearchErrorKind,
  type VisualSearchManualFilters,
  type VisualSearchRegion,
  type VisualSearchStatus,
  COLOR_VOCAB,
} from '@/components/visualsearch/visualSearchTypes';
import { DATA_MODE } from '@/lib/api/client';
import * as visualSearchService from '@/lib/api/services/visualSearch';
import { EMPTY_FILTERS } from '@/components/filters/filterTypes';
import { useSavedSearches, type SavedSearch } from '@/lib/store/savedSearches';

/** Per-phase dwell — the work is real but sub-frame; a short floor keeps
 *  each stage perceivable without theatre. */
const PHASE_DWELL_MS: Record<AnalysisPhase, number> = {
  reading: 280,
  extracting: 340,
  matching: 300,
};
/** Refine runs (region change) skip the decode phase and run faster. */
const REFINE_DWELL_MS = 200;

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** File → data-URL base64 payload (the `data:*;base64,` prefix stripped —
 *  the backend schema takes raw base64). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Build the request fields POST /visual-search accepts from the active
 * detected chips plus the member's manual filters — the same payload
 * mobile's useVisualSearchFilters.buildFilterPayload assembles:
 * query/category/brand/price are dedicated request fields; colour and
 * style are retrieval facets. A manual selection wins over the chip it
 * overlaps (the member's word beats the guess); the detected brand chip
 * feeds `brand` so removing it genuinely removes the filter.
 */
type VisualSearchRequestFields = Pick<
  visualSearchService.VisualSearchRequest,
  'query' | 'category' | 'brand' | 'minPrice' | 'maxPrice' | 'facets'
>;

function requestFields(
  attrs: DetectedAttribute[],
  inactive: ReadonlySet<DetectedAttribute['kind']>,
  manual: VisualSearchManualFilters,
): VisualSearchRequestFields {
  const active = attrs.filter((a) => !inactive.has(a.kind));
  const color = manual.color ?? active.find((a) => a.kind === 'color')?.value;
  // The detected category chip rides the dedicated `category` field; only
  // a member-chosen style populates the style facet.
  const style = manual.style;
  const category =
    manual.category || active.find((a) => a.kind === 'category')?.value;
  const brand =
    manual.brand.trim() || active.find((a) => a.kind === 'brand')?.label || '';
  const query = manual.query.trim();
  const fields: VisualSearchRequestFields = {};
  if (query) fields.query = query;
  if (category) fields.category = category;
  if (brand) fields.brand = brand;
  if (manual.priceMin != null) fields.minPrice = manual.priceMin;
  if (manual.priceMax != null) fields.maxPrice = manual.priceMax;
  if (color || style) {
    fields.facets = {
      ...(color ? { color } : {}),
      ...(style ? { style } : {}),
    };
  }
  return fields;
}

/**
 * Post-filter a live serve by the constraints the UI claims are active —
 * the manual panel's predicate plus the detected category/brand chips.
 * The backend honours the same request fields, so a correct serve passes
 * through untouched; this is the belt-and-braces layer that keeps the
 * displayed filters literally true whatever the serve returns. Colour
 * affinity can't be re-derived for arbitrary listings (fixture colour
 * table) — the colour chip's live narrowing stays server-side via
 * facets.color.
 */
function filterServeItems(
  items: Listing[],
  attributes: DetectedAttribute[],
  inactive: ReadonlySet<DetectedAttribute['kind']>,
  manual: VisualSearchManualFilters,
): Listing[] {
  return items.filter(
    (l) =>
      passesDetectedConstraints(l, attributes, inactive) &&
      passesManualFilters(l, manual),
  );
}

let querySeq = 0;
const nextQueryId = () =>
  `vq-${Date.now().toString(36)}-${(querySeq++).toString(36)}`;

/** Serve disclosures from the last live POST /visual-search — the
 *  retrieval method that actually produced the results, the backend's
 *  own note line and the honest scope counts. Null in fixture mode,
 *  before the first serve, and after any reset. */
export interface VisualSearchServeMeta {
  retrievalMeta: visualSearchService.VisualSearchRetrievalMeta | null;
  similarityMethod: string | null;
  note: string | null;
  matchCount: number | null;
  facetCounts: visualSearchService.VisualSearchFacetCounts | null;
}

export interface VisualSearchState {
  status: VisualSearchStatus;
  phase: AnalysisPhase;
  error: VisualSearchErrorKind | null;
  /** Correlates this analysis run — stamped onto a saved search so a
   *  "visual save" traces back to the query that produced it. */
  queryId: string | null;
  previewUrl: string | null;
  fileName: string;
  fileSize: number;
  features: ImageFeatures | null;
  attributes: DetectedAttribute[];
  /** Attribute kinds the user removed — chips are hard filters. */
  inactiveKinds: ReadonlySet<DetectedAttribute['kind']>;
  region: VisualSearchRegion | null;
  results: Listing[];
  /** Member-added filters — committed state (the panel drafts locally,
   *  Apply commits here and re-runs the match). */
  manualFilters: VisualSearchManualFilters;
  setManualFilters: (next: VisualSearchManualFilters) => void;
  clearManualFilters: () => void;
  /** Fixture-mode preview of a draft's result count — null in live mode
   *  (the serve's count can't be previewed client-side) or before
   *  features exist. */
  previewCount: (manual: VisualSearchManualFilters) => number | null;
  /** Live serve disclosures — how the backend actually matched. */
  serveMeta: VisualSearchServeMeta | null;
  pickFile: (file: File) => void;
  /** Fetch a remote image and run the same pipeline as a picked file —
   *  powers the dropzone's pasted-URL input and ?image= deep links. */
  pickImageUrl: (url: string) => void;
  /** True while a remote image is being fetched for pickImageUrl. */
  urlLoading: boolean;
  removePhoto: () => void;
  applyRegion: (region: VisualSearchRegion | null) => void;
  toggleAttribute: (kind: DetectedAttribute['kind']) => void;
  resetAttributes: () => void;
  retry: () => void;
}

export function useVisualSearch(): VisualSearchState {
  const [status, setStatus] = useState<VisualSearchStatus>('idle');
  const [phase, setPhase] = useState<AnalysisPhase>('reading');
  const [error, setError] = useState<VisualSearchErrorKind | null>(null);
  const [queryId, setQueryId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [features, setFeatures] = useState<ImageFeatures | null>(null);
  const [attributes, setAttributes] = useState<DetectedAttribute[]>([]);
  const [inactiveKinds, setInactiveKinds] = useState<ReadonlySet<DetectedAttribute['kind']>>(
    new Set(),
  );
  const [region, setRegion] = useState<VisualSearchRegion | null>(null);
  const [results, setResults] = useState<Listing[]>([]);
  const [manualFilters, setManualFiltersState] =
    useState<VisualSearchManualFilters>(EMPTY_MANUAL_FILTERS);
  const [serveMeta, setServeMeta] = useState<VisualSearchServeMeta | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);

  // ── Owned resources + sequencing ──────────────────────────────────────
  // previewRef/decodedRef hold the live blob URL and decoded image so a
  // replace/remove can dispose them synchronously; runRef is a monotonic
  // sequence so a stale analysis can never land under a newer photo —
  // same discipline as mobile's requestSequenceRef.
  const previewRef = useRef<string | null>(null);
  const decodedRef = useRef<DecodedImage | null>(null);
  const fileRef = useRef<File | null>(null);
  const runRef = useRef(0);
  const mountedRef = useRef(true);
  // Latest refs for the async pipeline — matching reads what the user
  // committed most recently, not the render the closure came from.
  const inactiveRef = useRef(inactiveKinds);
  const regionRef = useRef<VisualSearchRegion | null>(null);
  // Committed manual filters live in a ref too — the async pipeline reads
  // the latest apply, not the render the closure came from (same
  // convention as inactiveRef/regionRef and mobile's filtersRef).
  const manualRef = useRef<VisualSearchManualFilters>(manualFilters);
  useEffect(() => {
    inactiveRef.current = inactiveKinds;
  }, [inactiveKinds]);
  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  const disposeImage = useCallback(() => {
    runRef.current += 1;
    decodedRef.current?.dispose();
    decodedRef.current = null;
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    fileRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disposeImage();
    };
  }, [disposeImage]);

  const analyze = useCallback(async (mode: 'full' | 'refine') => {
    const my = ++runRef.current;
    const live = () => mountedRef.current && my === runRef.current;
    const dwell = (p: AnalysisPhase) => tick(mode === 'full' ? PHASE_DWELL_MS[p] : REFINE_DWELL_MS);

    setStatus('analyzing');
    // The serve call is a transport failure, not a decode failure —
    // catch maps them to different error copy.
    let serveFailed = false;

    try {
      if (mode === 'full') {
        setPhase('reading');
        await dwell('reading');
        if (!live()) return;
        const file = fileRef.current;
        const url = previewRef.current;
        if (!file || !url) return;
        decodedRef.current = await decodeImage(file, url);
      }
      const decoded = decodedRef.current;
      if (!decoded || !live()) return;

      setPhase('extracting');
      await dwell('extracting');
      if (!live()) return;
      const nextFeatures = extractFeatures(decoded, regionRef.current);
      const nextAttrs = detectAttributes(fileRef.current?.name ?? '', nextFeatures);

      setPhase('matching');
      if (!live()) return;
      let matched: Listing[];
      let nextServeMeta: VisualSearchServeMeta | null = null;
      if (DATA_MODE === 'live' && fileRef.current) {
        // Server-side matching — the backend scores candidates over the real
        // catalogue. Base64 the picked file; forward the framed region and
        // the still-active facet selections. The serve's own disclosures
        // (method/fallback/scope counts) come back with the items — they
        // are the only honest account of what matched.
        const imageBase64 = await fileToBase64(fileRef.current);
        if (!live()) return;
        const serve = await visualSearchService
          .runVisualSearch({
            imageBase64,
            region: regionRef.current ?? undefined,
            ...requestFields(nextAttrs, inactiveRef.current, manualRef.current),
          })
          .catch((e) => {
            serveFailed = true;
            throw e;
          });
        if (!live()) return;
        // Post-filter by the displayed constraints so a chip/panel value
        // the serve ignored still holds true on screen.
        matched = filterServeItems(
          serve.items,
          nextAttrs,
          inactiveRef.current,
          manualRef.current,
        );
        nextServeMeta = {
          retrievalMeta: serve.retrievalMeta ?? null,
          similarityMethod: serve.similarityMethod ?? null,
          note: serve.note ?? null,
          matchCount: serve.matchCount ?? null,
          facetCounts: serve.facetCounts ?? null,
        };
      } else {
        await dwell('matching');
        if (!live()) return;
        matched = matchListings(nextFeatures, {
          inactive: inactiveRef.current,
          attributes: nextAttrs,
          regionApplied: regionRef.current !== null,
          manual: manualRef.current,
        });
      }

      setFeatures(nextFeatures);
      setAttributes(nextAttrs);
      setResults(matched);
      setServeMeta(nextServeMeta);
      setStatus(matched.length > 0 ? 'populated' : 'empty');
    } catch {
      if (!live()) return;
      // Land on the explicit error state — keep the picked file + preview
      // so the query panel still shows the photo and `retry` can re-run
      // the full pipeline. The decoded bitmap is dropped; retry re-reads
      // the file rather than trusting a half-failed decode.
      setStatus('error');
      setError(serveFailed ? 'unreachable' : 'decode');
      decodedRef.current?.dispose();
      decodedRef.current = null;
      setFeatures(null);
      setAttributes([]);
      setResults([]);
      setServeMeta(null);
    }
  }, []);

  // Re-running the match over committed state — fixture mode scores the
  // cached features synchronously; live mode re-queries the backend with the
  // updated facet set (facets are applied in-query, not post-filtered).
  const rematch = useCallback(
    (inactive: ReadonlySet<DetectedAttribute['kind']>) => {
      if (!features || (status !== 'populated' && status !== 'empty')) return;
      if (DATA_MODE === 'live' && fileRef.current) {
        const file = fileRef.current;
        // Sequence against analyze — a newer photo pick or a later Apply
        // supersedes this serve; its results must not clobber fresher state.
        const my = ++runRef.current;
        void fileToBase64(file)
          .then((imageBase64) =>
            visualSearchService.runVisualSearch({
              imageBase64,
              region: regionRef.current ?? undefined,
              ...requestFields(attributes, inactive, manualRef.current),
            }),
          )
          .then((serve) => {
            if (!mountedRef.current || my !== runRef.current) return;
            const matched = filterServeItems(
              serve.items,
              attributes,
              inactive,
              manualRef.current,
            );
            setResults(matched);
            setServeMeta({
              retrievalMeta: serve.retrievalMeta ?? null,
              similarityMethod: serve.similarityMethod ?? null,
              note: serve.note ?? null,
              matchCount: serve.matchCount ?? null,
              facetCounts: serve.facetCounts ?? null,
            });
            setStatus(matched.length > 0 ? 'populated' : 'empty');
          })
          .catch(() => undefined);
        return;
      }
      const matched = matchListings(features, {
        inactive,
        attributes,
        regionApplied: region !== null,
        manual: manualRef.current,
      });
      setResults(matched);
      setStatus(matched.length > 0 ? 'populated' : 'empty');
    },
    [features, attributes, region, status],
  );

  const pickFile = useCallback(
    (file: File) => {
      // Validate before any state is committed — rejected picks stay on the
      // dropzone with the error line, no preview is ever created.
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setError('unsupported');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError('too-large');
        return;
      }
      setError(null);
      disposeImage();
      const url = URL.createObjectURL(file);
      previewRef.current = url;
      fileRef.current = file;
      setPreviewUrl(url);
      setFileName(file.name);
      setFileSize(file.size);
      setFeatures(null);
      setAttributes([]);
      setInactiveKinds(new Set());
      setRegion(null);
      setResults([]);
      setServeMeta(null);
      setQueryId(nextQueryId());
      // Manual filters persist across a replaced photo — the member's
      // intent survives the new query (mobile keeps its fields too).
      void analyze('full');
    },
    [analyze, disposeImage],
  );

  /**
   * Remote-image entry — fetches the URL and runs the identical pipeline
   * as a file pick (same validation, same decode, same blob lifecycle).
   * A blocked/private link lands on the honest 'unreachable' error, never
   * on a fabricated result.
   */
  const pickImageUrl = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        setError('unreachable');
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setError('unreachable');
        return;
      }
      const my = ++runRef.current;
      setError(null);
      setUrlLoading(true);
      fetch(parsed.toString())
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (my !== runRef.current || !mountedRef.current) return;
          const name =
            decodeURIComponent(parsed.pathname.split('/').pop() ?? '') ||
            'image';
          pickFile(new File([blob], name, { type: blob.type }));
        })
        .catch(() => {
          if (my !== runRef.current || !mountedRef.current) return;
          setError('unreachable');
        })
        .finally(() => {
          if (mountedRef.current) setUrlLoading(false);
        });
    },
    [pickFile],
  );

  const removePhoto = useCallback(() => {
    disposeImage();
    setStatus('idle');
    setError(null);
    setPreviewUrl(null);
    setFileName('');
    setFileSize(0);
    setFeatures(null);
    setAttributes([]);
    setInactiveKinds(new Set());
    setRegion(null);
    setResults([]);
    setServeMeta(null);
    setQueryId(null);
    // Removing the photo clears the refinements with it — mobile's
    // handleRemoveImage runs clearFields the same way.
    manualRef.current = EMPTY_MANUAL_FILTERS;
    setManualFiltersState(EMPTY_MANUAL_FILTERS);
  }, [disposeImage]);

  // Region confirm/clear — re-extracts features on the crop and re-ranks.
  // Region chips stay live: a framed colour replaces the colour chip's value.
  const applyRegion = useCallback(
    (next: VisualSearchRegion | null) => {
      regionRef.current = next;
      setRegion(next);
      if (decodedRef.current && status !== 'idle') void analyze('refine');
    },
    [analyze, status],
  );

  const toggleAttribute = useCallback(
    (kind: DetectedAttribute['kind']) => {
      setInactiveKinds((prev) => {
        const next = new Set(prev);
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);
        inactiveRef.current = next;
        rematch(next);
        return next;
      });
    },
    [rematch],
  );

  const resetAttributes = useCallback(() => {
    const next = new Set<DetectedAttribute['kind']>();
    inactiveRef.current = next;
    setInactiveKinds(next);
    rematch(next);
  }, [rematch]);

  // Manual refinement — the panel drafts locally; Apply commits here and
  // re-runs the match over the new constraint set. The ref write precedes
  // the state update so a rematch reads the committed values, and rematch
  // itself is a no-op until a result set exists to filter.
  const setManualFilters = useCallback(
    (next: VisualSearchManualFilters) => {
      manualRef.current = next;
      setManualFiltersState(next);
      rematch(inactiveRef.current);
    },
    [rematch],
  );

  const clearManualFilters = useCallback(() => {
    manualRef.current = EMPTY_MANUAL_FILTERS;
    setManualFiltersState(EMPTY_MANUAL_FILTERS);
    rematch(inactiveRef.current);
  }, [rematch]);

  // Fixture-mode Apply preview — the count the draft would produce, scored
  // over the cached features. Live mode can't preview a serve client-side.
  const previewCount = useCallback(
    (manual: VisualSearchManualFilters): number | null => {
      if (DATA_MODE === 'live' || !features) return null;
      return matchListings(features, {
        inactive: inactiveRef.current,
        attributes,
        regionApplied: region !== null,
        manual,
      }).length;
    },
    [features, attributes, region],
  );

  const retry = useCallback(() => {
    if (fileRef.current && status === 'error') void analyze('full');
  }, [analyze, status]);

  return {
    status,
    phase,
    error,
    queryId,
    previewUrl,
    fileName,
    fileSize,
    features,
    attributes,
    inactiveKinds,
    region,
    results,
    manualFilters,
    setManualFilters,
    clearManualFilters,
    previewCount,
    serveMeta,
    pickFile,
    pickImageUrl,
    urlLoading,
    removePhoto,
    applyRegion,
    toggleAttribute,
    resetAttributes,
    retry,
  };
}

/**
 * useSaveVisualSearch — web port of mobile useVisualSearchSaveSearch.
 * Persists the *derived* facet query into the shared saved-searches
 * store. The image itself is never persisted — only the attribute
 * text/facets it produced, which is exactly what replay and alerts can
 * honestly match on. Alerts therefore start off: a saved facet query can
 * watch for new matching listings, but the photo is not a durable matcher.
 */
export function useSaveVisualSearch() {
  const saveSearch = useSavedSearches((s) => s.saveSearch);
  return useCallback(
    (args: {
      queryId: string | null;
      attributes: DetectedAttribute[];
      inactiveKinds: ReadonlySet<DetectedAttribute['kind']>;
      results: Listing[];
      /** Committed panel filters — they shape the result set, so they
       *  shape what the saved search replays. */
      manualFilters: VisualSearchManualFilters;
    }): SavedSearch => {
      const active = args.attributes.filter(
        (a) => !args.inactiveKinds.has(a.kind),
      );
      const manual = args.manualFilters;
      const colourFor = (a: DetectedAttribute): string => {
        const hit = COLOR_VOCAB.find(
          (v) =>
            v.name.toLowerCase() === a.value ||
            v.name.toLowerCase() === a.label.toLowerCase() ||
            v.aliases.includes(a.value),
        );
        return hit?.name ?? a.label;
      };
      const dedupe = (xs: string[]) => {
        const seen = new Set<string>();
        return xs.filter((x) => {
          const k = x.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };
      const filters = {
        ...EMPTY_FILTERS,
        colours: dedupe([
          ...active.filter((a) => a.kind === 'color').map(colourFor),
          ...(manual.color ? [manual.color] : []),
        ]),
        categories: dedupe([
          ...active.filter((a) => a.kind === 'category').map((a) => a.value),
          ...(manual.category ? [manual.category] : []),
        ]),
        brands: dedupe([
          ...active.filter((a) => a.kind === 'brand').map((a) => a.label),
          ...(manual.brand.trim() ? [manual.brand.trim()] : []),
        ]),
        priceMin: manual.priceMin,
        priceMax: manual.priceMax,
      };
      // The saved query doubles as the replay text (?q= on /search) — a
      // typed description replays exactly; style joins it as the same
      // text-term the matcher treats it as. Otherwise the detected
      // attributes keep their existing label grammar.
      const queryText = [
        manual.query.trim(),
        ...(manual.style ? [`${manual.style} style`] : []),
      ]
        .filter(Boolean)
        .join(' · ');
      const fallback =
        active.length > 0
          ? `Photo search — ${active.map((a) => a.label).join(' · ')}`
          : 'Photo search';
      return saveSearch(queryText || fallback, filters, {
        kind: 'visual',
        queryId: args.queryId ?? undefined,
        resultCount: args.results.length,
        alertsOn: false,
      });
    },
    [saveSearch],
  );
}
