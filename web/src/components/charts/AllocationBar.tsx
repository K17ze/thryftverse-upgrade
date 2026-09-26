'use client';

/** AllocationBar — portfolio diversity strip. */

export function AllocationBar({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-surface-alt"
      role="img"
      aria-label={segments.map((s) => `${s.label} ${Math.round(s.pct)}%`).join(', ')}
    >
      {segments.map((s) => (
        <span key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />
      ))}
    </div>
  );
}
