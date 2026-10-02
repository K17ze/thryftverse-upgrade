'use client';

/** Numeric utility badge. `alert` (danger) is reserved for counts that
 *  need action — unread notifications, new messages. A bag count is
 *  inventory, not an alarm, so it wears the neutral brand pill. */
export function CountBadge({
  count,
  tone = 'alert',
}: {
  count: number;
  tone?: 'alert' | 'neutral';
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`tnum pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-bold leading-none ${
        tone === 'alert'
          ? 'bg-danger text-scrim-text-primary'
          : 'bg-brand text-text-inverse'
      }`}
      aria-hidden
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
