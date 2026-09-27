'use client';

/**
 * UploadProgressRing — web port of the mobile media-studio upload ring.
 * Determinate arc chases real transmitted bytes; an indeterminate arc spins
 * only while the presigned target reports no total. Failure becomes a
 * compact retry control. 'uploaded' renders nothing — the visible photo is
 * the completion state.
 */

import { Icon } from '@/components/ui/Icon';

export type MediaUploadStatus = 'uploading' | 'uploaded' | 'failed';

const RING = 30;
const STROKE = 3;
const RADIUS = RING / 2 - STROKE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface UploadProgressRingProps {
  status: MediaUploadStatus;
  /** Real byte progress 0..1 — null while the total is unknown. */
  progress?: number | null;
  /** Required for the failed state — the retry affordance. */
  onRetry?: () => void;
  /** Accessible label, e.g. "Uploading photo 2" / "Retry upload for photo 2". */
  label: string;
}

export function UploadProgressRing({
  status,
  progress,
  onRetry,
  label,
}: UploadProgressRingProps) {
  if (status === 'uploaded') return null;

  if (status === 'failed') {
    return (
      <button
        type="button"
        onClick={onRetry}
        aria-label={label}
        className="pressable absolute inset-0 flex items-center justify-center"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-overlay">
          <Icon name="refresh" size={20} className="text-scrim-text-primary" />
        </span>
      </button>
    );
  }

  const determinate = typeof progress === 'number' && progress >= 0;
  const arc = determinate ? Math.min(1, progress) * CIRCUMFERENCE : CIRCUMFERENCE * 0.25;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(arc / CIRCUMFERENCE * 100) : undefined}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-overlay">
        <svg
          width={RING}
          height={RING}
          viewBox={`0 0 ${RING} ${RING}`}
          className={determinate ? undefined : 'animate-spin'}
          aria-hidden
        >
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={STROKE}
          />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke="#ffffff"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${CIRCUMFERENCE - arc}`}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </svg>
      </span>
    </div>
  );
}
