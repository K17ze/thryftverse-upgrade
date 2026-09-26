/**
 * LIVE badge — red chip with a pulsing presence dot. The only badge on
 * the live surface; everything else is media + type.
 */

export function LiveBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-meta font-bold uppercase tracking-[0.08em] text-scrim-text-primary ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
      </span>
      Live
    </span>
  );
}
