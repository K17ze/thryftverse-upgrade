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
  type DecodedImage,
} from '@/components/visualsearch/visualSearchEngine';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_BYTES,
  type AnalysisPhase,
  type DetectedAttribute,
  type ImageFeatures,
  type VisualSearchErrorKind,
  type VisualSearchRegion,
  type VisualSearchStatus,
} from '@/components/visualsearch/visualSearchTypes';
import { DATA_MODE } from '@/lib/api/client';
import * as visualSearchService from '@/lib/api/services/visualSearch';

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

/** Map the local attribute chips onto the backend's facet vocabulary —
 *  colour and style go in-query; other kinds remain post-filters. */
function facetsFromAttributes(
  attrs: DetectedAttribute[],
  inactive: ReadonlySet<DetectedAttribute['kind']>,
): { color?: string; style?: string } | undefined {
  const active = attrs.filter((a) => !inactive.has(a.kind));
  const color = active.find((a) => a.kind === 'color')?.value;
  // 'style' isn't a local attribute kind — the backend style facet maps to
  // the category chip's value (streetwear, denim, etc.).
  const style = active.find((a) => a.kind === 'category')?.value;
  if (!color && !style) return undefined;
  return { color, style };
}

export interface VisualSearchState {
  status: VisualSearchStatus;
  phase: AnalysisPhase;
  error: VisualSearchErrorKind | null;
  previewUrl: string | null;
  fileName: string;
  fileSize: number;
  features: ImageFeatures | null;
  attributes: DetectedAttribute[];
  /** Attribute kinds the user removed — chips are hard filters. */
  inactiveKinds: ReadonlySet<DetectedAttribute['kind']>;
  region: VisualSearchRegion | null;
  results: Listing[];
  pickFile: (file: File) => void;
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
      if (DATA_MODE === 'live' && fileRef.current) {
        // Server-side matching — the backend scores candidates over the real
        // catalogue. Base64 the picked file; forward the framed region and
        // the still-active facet selections.
        const imageBase64 = await fileToBase64(fileRef.current);
        if (!live()) return;
        matched = await visualSearchService.runVisualSearch({
          imageBase64,
          region: regionRef.current ?? undefined,
          facets: facetsFromAttributes(nextAttrs, inactiveRef.current),
        });
      } else {
        await dwell('matching');
        if (!live()) return;
        matched = matchListings(nextFeatures, {
          inactive: inactiveRef.current,
          attributes: nextAttrs,
          regionApplied: regionRef.current !== null,
        });
      }

      setFeatures(nextFeatures);
      setAttributes(nextAttrs);
      setResults(matched);
      setStatus(matched.length > 0 ? 'populated' : 'empty');
    } catch {
      if (!live()) return;
      setStatus('idle');
      setError('decode');
      disposeImage();
      setPreviewUrl(null);
      setFileName('');
      setFileSize(0);
      setFeatures(null);
      setAttributes([]);
      setRegion(null);
      setResults([]);
    }
  }, [disposeImage]);

  // Re-running the match over committed state — fixture mode scores the
  // cached features synchronously; live mode re-queries the backend with the
  // updated facet set (facets are applied in-query, not post-filtered).
  const rematch = useCallback(
    (inactive: ReadonlySet<DetectedAttribute['kind']>) => {
      if (!features || (status !== 'populated' && status !== 'empty')) return;
      if (DATA_MODE === 'live' && fileRef.current) {
        const file = fileRef.current;
        void fileToBase64(file)
          .then((imageBase64) =>
            visualSearchService.runVisualSearch({
              imageBase64,
              region: regionRef.current ?? undefined,
              facets: facetsFromAttributes(attributes, inactive),
            }),
          )
          .then((matched) => {
            if (!mountedRef.current) return;
            setResults(matched);
            setStatus(matched.length > 0 ? 'populated' : 'empty');
          })
          .catch(() => undefined);
        return;
      }
      const matched = matchListings(features, {
        inactive,
        attributes,
        regionApplied: region !== null,
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
      void analyze('full');
    },
    [analyze, disposeImage],
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

  const retry = useCallback(() => {
    if (fileRef.current && status === 'error') void analyze('full');
  }, [analyze, status]);

  return {
    status,
    phase,
    error,
    previewUrl,
    fileName,
    fileSize,
    features,
    attributes,
    inactiveKinds,
    region,
    results,
    pickFile,
    removePhoto,
    applyRegion,
    toggleAttribute,
    resetAttributes,
    retry,
  };
}
