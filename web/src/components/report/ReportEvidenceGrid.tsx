'use client';

/**
 * ReportEvidenceGrid — evidence photo tiles. Rendering is mode-locked like
 * mobile: `editable` carries a per-tile remove action, `submitted` shows
 * only the image + attached badge. Object-URL previews use a plain img —
 * blob URIs can't flow through next/image's optimizer.
 */

import { Icon } from '@/components/ui/Icon';
import type { EvidenceItem } from './reportModel';

interface ReportEvidenceGridProps {
  items: EvidenceItem[];
  mode: 'editable' | 'submitted';
  onRemove?: (id: string) => void;
}

export function ReportEvidenceGrid({ items, mode, onRemove }: ReportEvidenceGridProps) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${mode === 'submitted' ? 'justify-center' : ''}`}
    >
      {items.map((item, i) => (
        <div key={item.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- object-URL previews cannot go through next/image */}
          <img
            src={item.uri}
            alt={`Evidence photo ${i + 1}`}
            className="h-[72px] w-[72px] rounded-md object-cover"
          />
          <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-success">
            <Icon name="check" size={12} className="text-scrim-text-primary" />
          </span>
          {mode === 'editable' ? (
            <button
              type="button"
              onClick={() => onRemove?.(item.id)}
              aria-label={`Remove evidence photo ${i + 1}`}
              className="pressable absolute -right-1.5 -top-1.5 text-danger-text"
            >
              <Icon name="close" filled size={22} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
