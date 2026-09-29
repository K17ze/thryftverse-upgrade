'use client';

/**
 * Shared controls for the issue studio — the same flat grammar the
 * auction composer uses: roving-tabindex radio groups, one checkbox row
 * chrome, segmented options. Nothing carded, hairlines only.
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

/** ARIA radio-group keyboard grammar — arrows/Home/End move focus AND
 *  selection; only the checked (or first) radio is a tab stop. Same
 *  behaviour as app/auctions/create. */
export function onRadioGroupKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  const current = radios.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  let next = -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    next = (current + 1) % radios.length;
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    next = (current - 1 + radios.length) % radios.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = radios.length - 1;
  }
  if (next < 0 || next === current) return;
  event.preventDefault();
  const target = radios[next];
  target?.focus();
  target?.click();
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/** Segmented single-select — flat buttons, selected takes brand ink. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="radiogroup"
      aria-label={label}
      onKeyDown={onRadioGroupKeyDown}
    >
      {options.map((option, i) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value || (!value && i === 0) ? 0 : -1}
          onClick={() => onChange(option.value)}
          className={`pressable h-9 rounded-md px-4 text-caption font-semibold ${
            value === option.value
              ? 'bg-brand text-text-inverse'
              : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface CheckRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  /** Muted qualifier next to the label (e.g. "optional"). */
  aside?: ReactNode;
}

/** Checkbox row — the auction composer's buy-now toggle grammar. */
export function CheckRow({ checked, onChange, label, aside }: CheckRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="pressable flex h-11 items-center gap-2.5 self-start text-body-emphasis font-medium text-text-primary"
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
          checked ? 'border-brand bg-brand text-text-inverse' : 'border-border'
        }`}
      >
        {checked ? <Icon name="check" size={13} /> : null}
      </span>
      {label}
      {aside ? <span className="text-meta font-normal text-text-muted">{aside}</span> : null}
    </button>
  );
}
