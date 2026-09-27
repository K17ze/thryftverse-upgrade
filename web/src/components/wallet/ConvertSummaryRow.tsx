'use client';

/**
 * ConvertSummaryRow — one tnum breakdown line, ported from the mobile
 * component of the same name. `total` carries the emphasis; `negative`
 * tints fee lines.
 */

interface ConvertSummaryRowProps {
  label: string;
  value: string;
  total?: boolean;
  negative?: boolean;
}

export function ConvertSummaryRow({ label, value, total = false, negative = false }: ConvertSummaryRowProps) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        total ? 'mt-1 border-t border-border-subtle pt-3' : 'py-1.5'
      }`}
    >
      <span
        className={`text-body ${total ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
      >
        {label}
      </span>
      <span
        className={`tnum ${
          total
            ? 'text-price-list font-bold text-text-primary'
            : negative
              ? 'text-body text-danger-text'
              : 'text-body text-text-primary'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
