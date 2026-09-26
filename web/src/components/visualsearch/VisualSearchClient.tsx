'use client';

/**
 * VisualSearchClient — /search/visual orchestrator.
 * Idle → the dropzone is the dominant object. Once a photo lands: a slim
 * query column (preview, frame/replace/remove, detected chips) beside the
 * results machine. Flat canvas, spacing + labels carry the hierarchy.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useVisualSearch } from '@/lib/hooks/visual-search-queries';
import { honestMatchNote } from './visualSearchEngine';
import { VisualSearchDropzone } from './VisualSearchDropzone';
import { VisualSearchQueryPanel } from './VisualSearchQueryPanel';
import { VisualSearchRefinementBar } from './VisualSearchRefinementBar';
import { VisualSearchResults } from './VisualSearchResults';

export function VisualSearchClient() {
  const vs = useVisualSearch();
  const [framing, setFraming] = useState(false);

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
    <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-section-title font-semibold text-text-primary">Search by photo</h1>
        <Link
          href="/search"
          className="pressable flex items-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="search" size={14} />
          Text search
        </Link>
      </div>

      {!isActive ? (
        <div className="mt-10 sm:mt-16">
          <VisualSearchDropzone error={vs.error} onPick={vs.pickFile} />
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
            </div>
          </aside>

          <section className="min-w-0">
            <VisualSearchResults
              status={vs.status}
              phase={vs.phase}
              results={vs.results}
              honestNote={honestMatchNote(vs.region !== null)}
              hasRemovedAttributes={vs.inactiveKinds.size > 0}
              onRestoreAttributes={vs.resetAttributes}
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
