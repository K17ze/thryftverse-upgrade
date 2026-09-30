'use client';

/**
 * AnimatedCheck — the success marker for confirmed writes (order placed,
 * listing published, payout initiated). Native plays a success
 * celebration; web's equivalent is an SVG that draws itself in: the
 * circle strokes in, then the tick, then a single quiet ring expands
 * outward once. Pure CSS — the global prefers-reduced-motion rule
 * collapses every animation to instant, so no JS gating is needed.
 *
 * Draw-in runs on mount only; the element holds its final frame.
 */

interface AnimatedCheckProps {
  /** Circle diameter in px. */
  size?: number;
  className?: string;
}

export function AnimatedCheck({ size = 64, className = '' }: AnimatedCheckProps) {
  const stroke = Math.max(2.5, size / 22);
  // Perimeter approximations for the dash draw — circle r=26 in a 64-box
  // scales to the requested size via the viewBox.
  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* One-shot expanding ring — the "burst". */}
      <span className="anim-check-ring" aria-hidden />
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className="anim-check-svg"
      >
        <circle
          className="anim-check-circle"
          cx="32"
          cy="32"
          r="26"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100}
        />
        <path
          className="anim-check-tick"
          d="M21 33.5 28.5 41 44 24"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100}
        />
      </svg>
    </span>
  );
}
