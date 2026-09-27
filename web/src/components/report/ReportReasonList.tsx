'use client';

/**
 * ReportReasonList — single-select reason rows: icon tile, label,
 * description and a trailing radio. Direct port of the mobile component —
 * same hairline-divided flat list, same single grammar.
 */

import { Icon } from '@/components/ui/Icon';
import { REPORT_REASONS, type ReportReason, type ReportReasonOption } from './reportModel';

interface ReportReasonListProps<K extends string = ReportReason> {
  selected: K | null;
  onSelect: (reason: K) => void;
  /** Override the catalogue — the DSA notice uses its own reason set. */
  reasons?: ReportReasonOption<K>[];
  /** radiogroup label — callers pass a flow-specific name. */
  ariaLabel?: string;
}

export function ReportReasonList<K extends string = ReportReason>({
  selected,
  onSelect,
  reasons,
  ariaLabel = 'Report reason',
}: ReportReasonListProps<K>) {
  const options = (reasons ?? REPORT_REASONS) as ReportReasonOption<K>[];
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="border-y border-border-subtle"
    >
      {options.map((reason, index) => {
        const isSelected = selected === reason.key;
        return (
          <button
            key={reason.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(reason.key)}
            className={`pressable flex min-h-[64px] w-full items-center gap-3 py-3 text-left ${
              index < options.length - 1 ? 'border-b border-border-subtle' : ''
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                isSelected
                  ? 'bg-brand-subtle text-text-primary'
                  : 'bg-surface-alt text-text-muted'
              }`}
            >
              <Icon name={reason.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold text-text-primary">
                {reason.label}
              </span>
              <span className="mt-0.5 block text-caption text-text-muted">
                {reason.description}
              </span>
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                isSelected ? 'border-text-primary' : 'border-border'
              }`}
            >
              {isSelected ? (
                <span className="h-2.5 w-2.5 rounded-full bg-text-primary" />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
