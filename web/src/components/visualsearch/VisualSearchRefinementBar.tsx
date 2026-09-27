'use client';

/**
 * VisualSearchRefinementBar — detected attributes as removable chips.
 * Web port of mobile's refinement bar reduced to what the fixture engine
 * actually detects: colour (from the photo's pixels), category and brand
 * (filename cues or the modal values of the colour-ranked candidates).
 * Removing a chip drops that hard filter and re-matches instantly.
 */

import { Icon, type AppIconName } from '@/components/ui/Icon';
import type { DetectedAttribute } from './visualSearchTypes';

interface VisualSearchRefinementBarProps {
  attributes: DetectedAttribute[];
  inactiveKinds: ReadonlySet<DetectedAttribute['kind']>;
  onToggle: (kind: DetectedAttribute['kind']) => void;
  onReset: () => void;
}

const KIND_ICON: Record<DetectedAttribute['kind'], AppIconName> = {
  color: 'palette',
  category: 'tag',
  brand: 'pricetag',
};

const KIND_LABEL: Record<DetectedAttribute['kind'], string> = {
  color: 'Colour',
  category: 'Category',
  brand: 'Brand',
};

export function VisualSearchRefinementBar({
  attributes,
  inactiveKinds,
  onToggle,
  onReset,
}: VisualSearchRefinementBarProps) {
  if (attributes.length === 0) return null;
  const removedCount = inactiveKinds.size;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-label font-semibold uppercase tracking-wide text-text-muted">
          Detected in your photo
        </h2>
        {removedCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="pressable -mr-2 rounded-md px-2 py-1 text-caption font-medium text-text-secondary hover:text-text-primary"
          >
            Restore
          </button>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Detected attributes — remove to widen results">
        {attributes.map((attr) => {
          const active = !inactiveKinds.has(attr.kind);
          return (
            <button
              key={attr.kind}
              type="button"
              onClick={() => onToggle(attr.kind)}
              aria-pressed={active}
              aria-label={`${KIND_LABEL[attr.kind]} ${attr.label} — ${
                active ? 'filtering results, remove' : 'removed, reapply'
              }`}
              title={attr.source === 'results' ? 'Guessed from top colour matches' : undefined}
              className={`pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-body font-medium ${
                active
                  ? 'bg-surface-alt text-text-primary hover:bg-surface-raised'
                  : 'bg-transparent text-text-muted ring-1 ring-inset ring-border hover:text-text-secondary'
              }`}
            >
              {attr.kind === 'color' && attr.rgb ? (
                <span
                  className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-border"
                  style={{ backgroundColor: `rgb(${attr.rgb[0]},${attr.rgb[1]},${attr.rgb[2]})` }}
                  aria-hidden
                />
              ) : (
                <Icon name={KIND_ICON[attr.kind]} size={14} />
              )}
              <span className="text-caption text-text-muted">{KIND_LABEL[attr.kind]}</span>
              {attr.label}
              <Icon name="close" size={13} className={active ? 'text-text-muted' : 'text-text-muted opacity-60'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
