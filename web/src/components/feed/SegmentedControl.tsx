'use client';

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

/**
 * Segmented control — For You / Following. One quiet pill group; the
 * selected thumb uses the same fill grammar as a selected Chip
 * (bg-brand, inverse text, flat — no shadow). Optional count sits as
 * quiet tabular meta inside the label, mirroring the mobile tab badge.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={`inline-flex rounded-full bg-surface-alt p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`pressable flex items-center gap-1.5 rounded-full px-4 py-1.5 text-body-emphasis ${
              active
                ? 'bg-brand text-text-inverse'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {opt.label}
            {typeof opt.count === 'number' && opt.count > 0 ? (
              <span
                className={`tnum text-meta ${
                  active ? 'text-text-inverse/80' : 'text-text-muted'
                }`}
              >
                {opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
