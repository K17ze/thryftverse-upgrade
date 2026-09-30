'use client';

import { Icon } from '@/components/ui/Icon';

/** Visible 18px box inside a 44px hit area — the selection affordance. */
export function RowCheckbox({
  checked,
  mixed,
  label,
  onToggle,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      onClick={onToggle}
      // 36px visual column padded to a 44px hit width by the ::after
      // bleed — the same pad-out idiom the filter rail uses, so the row
      // spacing doesn't move.
      className="pressable relative -ml-2 flex h-11 w-9 shrink-0 items-center justify-center after:absolute after:-inset-x-1 after:content-['']"
    >
      <span
        className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
          checked || mixed
            ? 'border-brand bg-brand text-text-inverse'
            : 'border-border bg-surface hover:border-text-muted'
        }`}
      >
        {mixed ? (
          <span className="block h-0.5 w-2 rounded-full bg-current" aria-hidden />
        ) : checked ? (
          <Icon name="check" size={12} />
        ) : null}
      </span>
    </button>
  );
}
