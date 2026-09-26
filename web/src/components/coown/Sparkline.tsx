/**
 * Sparkline — hand-rolled SVG polyline from candle closes. ~80×24, no
 * chart library. Downsampled to ~40 points and tinted by first→last
 * move; flat series render as a quiet neutral midline.
 */
import type { CandlePoint } from '@/lib/contracts/coown';

const MAX_POINTS = 40;

/** Evenly sampled closes — keeps the last candle so the line ends at last price. */
function closes(candles: CandlePoint[]): number[] {
  const raw = candles.map((c) => c.c);
  if (raw.length <= MAX_POINTS) return raw;
  const stride = raw.length / MAX_POINTS;
  const out: number[] = [];
  for (let i = 0; i < MAX_POINTS; i++) out.push(raw[Math.floor(i * stride)]!);
  out.push(raw[raw.length - 1]!);
  return out;
}

export function Sparkline({
  candles,
  width = 80,
  height = 24,
  className = '',
}: {
  candles: CandlePoint[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const pts = closes(candles);
  if (pts.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden="true" focusable="false" />
    );
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min;
  const pad = 2;
  const inner = height - pad * 2;
  const x = (i: number) => (i / (pts.length - 1)) * width;
  const y = (v: number) => pad + (span > 0 ? (1 - (v - min) / span) * inner : inner / 2);
  const rising = pts[pts.length - 1]! >= pts[0]!;
  const stroke =
    span === 0 ? 'var(--text-muted)' : rising ? 'var(--coown-up)' : 'var(--coown-down)';
  const points = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last-price marker — the line ends where the market is now. */}
      <circle cx={width} cy={y(pts[pts.length - 1]!)} r={2} fill={stroke} />
    </svg>
  );
}
