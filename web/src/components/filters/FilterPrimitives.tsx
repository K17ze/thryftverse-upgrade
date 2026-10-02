'use client';

import React, { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import type { FacetOption } from '@/components/search/facetCounts';

export const FIELD =
  'h-11 w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

export const MAX_CHIP_OPTIONS = 8;

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-label text-text-muted">
      {children}
    </h3>
  );
}

/** Toggle one value in/out of a multi-select list (case-insensitive). */
export function toggleValue(list: string[], value: string): string[] {
  const v = value.toLowerCase();
  return list.some((x) => x.toLowerCase() === v)
    ? list.filter((x) => x.toLowerCase() !== v)
    : [...list, value];
}

/** Counted multi-select chips for a facet — the sheet counterpart of a rail checkbox group */
export function FacetChips({
  options,
  selected,
  onToggle,
}: {
  options: FacetOption[];
  selected: string[];
  onToggle: (o: FacetOption) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? options : options.slice(0, MAX_CHIP_OPTIONS);
  const hidden = options.length - visible.length;

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {visible.map((o) => (
          <Chip
            key={o.value}
            selected={selected.some((s) => s.toLowerCase() === o.value)}
            onClick={() => onToggle(o)}
          >
            {o.swatch ? (
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border border-border-subtle"
                style={{ backgroundColor: o.swatch }}
              />
            ) : null}
            {o.label}
            <span className="tnum opacity-60">{o.count}</span>
          </Chip>
        ))}
      </div>
      {options.length > MAX_CHIP_OPTIONS ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="pressable relative mt-2 flex h-8 items-center gap-1 rounded-md px-1 text-caption font-semibold text-text-secondary after:absolute after:-inset-y-1.5 after:content-[''] hover:text-text-primary"
        >
          {expanded ? 'Show less' : `Show ${hidden} more`}
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
        </button>
      ) : null}
    </div>
  );
}

/** Checkbox row grammar shared by Condition and the availability toggle */
export function CheckRow({
  label,
  checked,
  count,
  onToggle,
}: {
  label: string;
  checked: boolean;
  count?: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="pressable flex h-11 w-full items-center gap-3 text-left"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
          checked
            ? 'border-brand bg-brand text-text-inverse'
            : 'border-border bg-surface'
        }`}
      >
        {checked ? <Icon name="check" size={14} /> : null}
      </span>
      <span className="min-w-0 flex-1 text-body text-text-primary">
        {label}
      </span>
      {count != null ? (
        <span className="tnum shrink-0 text-caption text-text-muted">
          {count}
        </span>
      ) : null}
    </button>
  );
}
