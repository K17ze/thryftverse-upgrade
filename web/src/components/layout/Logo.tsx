import Link from 'next/link';

/** Wordmark — Inter extrabold, tight tracking. Quiet, not a badge. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`select-none text-[22px] font-extrabold tracking-[-0.8px] text-text-primary ${className}`}
      aria-label="ThryftVerse home"
    >
      ThryftVerse
    </Link>
  );
}
