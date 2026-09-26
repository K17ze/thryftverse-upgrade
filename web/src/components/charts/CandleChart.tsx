'use client';

/** CandleChart — OHLC candles for the asset detail price panel. */

import type { CandlePoint } from '@/lib/contracts/coown';

export function CandleChart({ data, ariaLabel }: { data: CandlePoint[]; ariaLabel: string }) {
  const W = 800;
  const H = 260;
  const PAD_R = 56;
  if (data.length < 2) {
    return <div className="rounded-lg bg-surface-alt" style={{ height: H }} aria-hidden="true" />;
  }
  const min = Math.min(...data.map((d) => d.l));
  const max = Math.max(...data.map((d) => d.h));
  const slot = (W - PAD_R) / data.length;
  const bw = Math.max(2, Math.min(9, slot * 0.55));
  const y = (v: number) => H - 24 - ((v - min) / (max - min || 1)) * (H - 48) - 12;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={ariaLabel}>
      {[0, 1, 2, 3, 4].map((i) => {
        const v = min + ((max - min) / 4) * i;
        return (
          <g key={i}>
            <line x1={0} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={W - PAD_R + 8} y={y(v) + 4} fontSize={11} fill="var(--text-muted)" className="tnum">
              £{v.toFixed(0)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const up = d.c >= d.o;
        const color = up ? 'var(--coown-up)' : 'var(--coown-down)';
        const cx = slot * i + slot / 2;
        const bodyTop = y(Math.max(d.o, d.c));
        const bodyH = Math.max(1, y(Math.min(d.o, d.c)) - bodyTop);
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(d.h)} y2={y(d.l)} stroke={color} strokeWidth={1} />
            <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
