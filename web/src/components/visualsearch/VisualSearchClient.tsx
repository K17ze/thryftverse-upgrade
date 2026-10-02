'use client';

/**
 * VisualSearchClient — /search/visual orchestrator.
 * Idle → the dropzone is the dominant object. Once a photo lands: a slim
 * query column (preview, frame/replace/remove, detected chips) beside the
 * results machine. Flat canvas, spacing + labels carry the hierarchy.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import {
  useSaveVisualSearch,
  useVisualSearch,
} from '@/lib/hooks/visual-search-queries';
import { honestMatchNote, liveMatchNote } from './visualSearchEngine';
import { manualFiltersActive } from './visualSearchTypes';
import { VisualSearchDropzone } from './VisualSearchDropzone';
import { VisualSearchFilterPanel } from './VisualSearchFilterPanel';
import { VisualSearchQueryPanel } from './VisualSearchQueryPanel';
import { VisualSearchRefinementBar } from './VisualSearchRefinementBar';
import { VisualSearchResults } from './VisualSearchResults';

export function VisualSearchClient() {
  const vs = useVisualSearch();
  const saveVisualSearch = useSaveVisualSearch();
  const [framing, setFraming] = useState(false);
  // The queryId this surface already persisted — prevents duplicate saves
  // of the same photo's derived query. Resets when a new photo lands.
  const [savedForQuery, setSavedForQuery] = useState<string | null>(null);

  // Refining after a save leaves the persisted entry stale — re-arm the
  // button so the updated filter set can be saved again.
  useEffect(() => {
    setSavedForQuery(null);
  }, [vs.queryId, vs.manualFilters, vs.inactiveKinds]);

  // ?image=<url> deep link — the entry point a "visually similar" tile
  // affordance targets. Read once on mount (analysis can never SSR, so a
  // window.read is the honest path — no Suspense needed for the page).
  const { pickImageUrl } = vs;
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const image = new URLSearchParams(window.location.search).get('image');
    if (image) pickImageUrl(image);
  }, [pickImageUrl]);

  const handleRemove = useCallback(() => {
    setFraming(false);
    vs.removePhoto();
  }, [vs]);

  const handleReplace = useCallback(
    (file: File) => {
      setFraming(false);
      vs.pickFile(file);
    },
    [vs],
  );

  const previewUrl = vs.previewUrl;
  const isActive = previewUrl !== null && vs.status !== 'idle';

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">Search by photo</h1>
        <Link
          href="/search"
          className="pressable flex items-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="search" size={14} />
          Text search
        </Link>
      </div>

      {!isActive ? (
        <div className="mt-10 sm:mt-16 lg:mt-20">
          <VisualSearchDropzone
            error={vs.error}
            onPick={vs.pickFile}
            onPickUrl={vs.pickImageUrl}
            urlLoading={vs.urlLoading}
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <div className="lg:sticky lg:top-20">
              <VisualSearchQueryPanel
                previewUrl={previewUrl}
                fileName={vs.fileName}
                fileSize={vs.fileSize}
                framing={framing}
                onToggleFraming={() => setFraming((f) => !f)}
                region={vs.region}
                onCommitRegion={vs.applyRegion}
                onReplace={handleReplace}
                onRemove={handleRemove}
              />
              {vs.attributes.length > 0 && vs.status !== 'analyzing' ? (
                <div className="mt-5">
                  <VisualSearchRefinementBar
                    attributes={vs.attributes}
                    inactiveKinds={vs.inactiveKinds}
                    onToggle={vs.toggleAttribute}
                    onReset={vs.resetAttributes}
                  />
                </div>
              ) : null}
              {/* Manual refinement — the member adds what the photo didn't
                  say. Renders once a result set exists (populated or empty);
                  Apply re-runs the match through the hook. */}
              {vs.features !== null &&
              (vs.status === 'populated' || vs.status === 'empty') ? (
                <div className="mt-6 border-t border-border-subtle pt-5">
                  <VisualSearchFilterPanel
                    committed={vs.manualFilters}
                    facetCounts={vs.serveMeta?.facetCounts ?? null}
                    previewCount={vs.previewCount}
                    onApply={vs.setManualFilters}
                    onClear={vs.clearManualFilters}
                  />
                </div>
              ) : null}
            </div>
          </aside>

          <section className="min-w-0">
            {vs.status === 'populated' || vs.status === 'empty' ? (
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-meta text-text-muted">
                  {savedForQuery !== null && savedForQuery === vs.queryId
                    ? 'Saved — replay and alerts use the detected details, not the photo.'
                    : manualFiltersActive(vs.manualFilters)
                      ? 'Save the detected details and your added filters to re-run this match.'
                      : 'Save the detected details to re-run this match later.'}
                </p>
                <button
                  type="button"
                  disabled={savedForQuery !== null && savedForQuery === vs.queryId}
                  onClick={() =>
                    setSavedForQuery(
                      saveVisualSearch({
                        queryId: vs.queryId,
                        attributes: vs.attributes,
                        inactiveKinds: vs.inactiveKinds,
                        results: vs.results,
                        manualFilters: vs.manualFilters,
                      }).queryId ?? vs.queryId,
                    )
                  }
                  className="pressable flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-caption font-semibold text-text-primary disabled:opacity-60"
                >
                  <Icon
                    name={
                      savedForQuery !== null && savedForQuery === vs.queryId
                        ? 'check'
                        : 'bookmark'
                    }
                    size={15}
                  />
                  {savedForQuery !== null && savedForQuery === vs.queryId
                    ? 'Saved'
                    : 'Save search'}
                </button>
              </div>
            ) : null}
            <VisualSearchResults
              status={vs.status}
              phase={vs.phase}
              results={vs.results}
              honestNote={
                // Live mode shows the serve's own account — retrievalMeta
                // names what actually matched (heuristic vs filter-only
                // fallback); fixture keeps the on-device note.
                vs.serveMeta
                  ? liveMatchNote(vs.serveMeta.retrievalMeta, vs.serveMeta.note)
                  : honestMatchNote(vs.region !== null)
              }
              hasRemovedAttributes={vs.inactiveKinds.size > 0}
              onRestoreAttributes={vs.resetAttributes}
              hasManualFilters={manualFiltersActive(vs.manualFilters)}
              onClearManualFilters={vs.clearManualFilters}
              onChooseAnother={() => {
                // Re-enter the picker via the panel's Replace action.
                handleRemove();
              }}
              onRetry={vs.retry}
            />
          </section>
        </div>
      )}
    </div>
  );
}
