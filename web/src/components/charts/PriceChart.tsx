'use client';

/**
 * PriceChart — area/line price history with pointer crosshair.
 * Deterministic SVG from the data; interaction is pointer-only overlay.
 * A dashed marker at the current unit price anchors the line's end
 * (Polymarket grammar: one clean line, one honest "now" point).
 */

import { useRef, useState } from 'react';
import type { CandlePoint } from '@/lib/contracts/coown';

const W = 800;
const H = 260;
const PAD_R = 56;
const PAD_B = 24;

export function PriceChart({
  data,
  ariaLabel,
  windowLabel,
  currentPrice,
}: {
  data: CandlePoint[];
  ariaLabel: string;
  windowLabel?: string;
  /** The asset's live unit price — dashed marker + end dot when in range. */
  currentPrice?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length < 2) {
    return <div className="h-[260px] rounded-lg bg-surface-alt" aria-hidden="true" />;
  }

  const min = Math.min(...data.map((d) => d.l));
  const max = Math.max(...data.map((d) => d.h));
  const x = (i: number) => (i / (data.length - 1)) * (W - PAD_R);
  const y = (v: number) => H - PAD_B - ((v - min) / (max - min || 1)) * (H - PAD_B - 16) - 8;
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.c).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - PAD_B} L0,${H - PAD_B} Z`;
  const up = data[data.length - 1]!.c >= data[0]!.o;
  const stroke = up ? 'var(--coown-up)' : 'var(--coown-down)';
  const active = hoverIdx != null ? (data[hoverIdx] ?? null) : null;
  const fmt = (v: number) => `£${v.toFixed(v >= 100 ? 0 : 2)}`;
  const markerY =
    currentPrice != null && currentPrice >= min && currentPrice <= max
      ? y(currentPrice)
      : null;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]!.c);

  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((px / (W - PAD_R)) * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  return (
    <div ref={ref} className="relative touch-none" onPointerMove={onMove} onPointerLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label={ariaLabel}>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = min + ((max - min) / 4) * i;
          return (
            <g key={i}>
              <line x1={0} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" strokeWidth={1} />
              <text x={W - PAD_R + 8} y={y(v) + 4} fontSize={11} fill="var(--text-muted)" className="tnum">
                {fmt(v)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={stroke} fillOpacity={0.07} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        {markerY != null ? (
          <g>
            <line
              x1={0}
              x2={W - PAD_R}
              y1={markerY}
              y2={markerY}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.6}
            />
            <text
              x={W - PAD_R + 8}
              y={markerY - 6}
              fontSize={11}
              fontWeight={600}
              fill={stroke}
              className="tnum"
            >
              {fmt(currentPrice!)}
            </text>
          </g>
        ) : null}
        {/* Current point — the "now" marker on the line's end. */}
        <circle cx={lastX} cy={lastY} r={3.5} fill={stroke} stroke="var(--surface)" strokeWidth={1.5} />
        {active ? (
          <g>
            <line
              x1={x(hoverIdx!)}
              x2={x(hoverIdx!)}
              y1={0}
              y2={H - PAD_B}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={x(hoverIdx!)} cy={y(active.c)} r={3.5} fill={stroke} />
          </g>
        ) : null}
      </svg>
      {active ? (
        <div
          className="pointer-events-none absolute top-2 rounded-md border border-border-subtle bg-surface-elevated px-2.5 py-1.5 text-meta text-text-primary shadow-floating"
          style={{ left: `min(calc(100% - 170px), ${(x(hoverIdx!) / W) * 100}%)` }}
        >
          <span className="tnum font-semibold">£{active.c.toFixed(2)}</span>
          <span className="ml-2 text-text-muted">
            {new Date(active.t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ) : null}
      {windowLabel ? <span className="absolute right-14 top-1 text-micro text-text-muted">{windowLabel}</span> : null}
    </div>
  );
}
