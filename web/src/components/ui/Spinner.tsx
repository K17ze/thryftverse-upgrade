export interface SpinnerProps {
  /** Pixel size; spinners ≤14px use a 1px ring, larger use 2px. */
  size?: number;
  /** Ring contrast: brand accent, quiet neutral, inherit color, or scrim-on-media. */
  tone?: 'brand' | 'neutral' | 'inherit' | 'scrim';
  className?: string;
  /** Set when the spinner is the only loading indicator and must be announced. */
  label?: string;
}

const TONES = {
  brand: 'border-border border-t-brand',
  neutral: 'border-border border-t-text-primary',
  inherit: 'border-current border-t-transparent',
  scrim: 'border-scrim-text-primary border-t-transparent',
} as const;

/** One spinner grammar: hairline ring, 800ms rotation, reduced-motion aware. */
export function Spinner({ size = 16, tone = 'brand', className, label }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      style={{ width: size, height: size }}
      className={[
        'inline-block shrink-0 animate-spin rounded-full',
        size <= 14 ? 'border' : 'border-2',
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
