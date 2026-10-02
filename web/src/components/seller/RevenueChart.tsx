'use client';

/**
 * RevenueChart — the hub's dominant surface as a daily column series.
 * Revenue lands in discrete days with real zero-spikes, so columns read
 * the data honestly where a smoothed line would invent continuity.
 * Deterministic SVG, one hairline baseline, no grid chrome — the column
 * heights are the information. Hover highlights the day and reads it out.
 */

import { useMemo, useState } from 'react';
import type { SellerDailyPoint } from '@/lib/data/fixtures-seller';

const W = 720;
const H = 210;
const PAD_Y = 14;

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const money = (v: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: v % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);

interface ChartBar {
  x: number;
  y: number;
  w: number;
  h: number;
  point: SellerDailyPoint;
}

export function RevenueChart({
  points,
  ariaLabel,
}: {
  points: SellerDailyPoint[];
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const bars = useMemo<ChartBar[]>(() => {
    const max = Math.max(...points.map((p) => p.revenue), 1);
    const stepX = W / Math.max(1, points.length);
    const w = Math.min(14, Math.max(2, stepX * 0.62));
    return points.map((p, i) => {
      const h = (p.revenue / max) * (H - PAD_Y * 2);
      return {
        x: i * stepX + (stepX - w) / 2,
        y: H - PAD_Y - h,
        w,
        h,
        point: p,
      };
    });
  }, [points]);

  const active = hover != null ? bars[hover] ?? null : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {/* Baseline — the axis is the only chrome */}
        <line
          x1={0}
          x2={W}
          y1={H - PAD_Y}
          y2={H - PAD_Y}
          className="stroke-border-subtle"
          strokeWidth={1}
        />
        {bars.map((b, i) => (
          <rect
            key={b.point.date}
            x={b.x}
            y={b.y}
            width={b.w}
            height={Math.max(0, b.h)}
            className="fill-brand"
            opacity={hover == null ? 0.85 : i === hover ? 1 : 0.3}
          />
        ))}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="transparent"
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const idx = Math.round(((e.clientX - box.left) / box.width) * (points.length - 1));
            setHover(Math.max(0, Math.min(points.length - 1, idx)));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {active ? (
        <div
          className="pointer-events-none absolute top-0 z-elevated -translate-x-1/2 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 shadow-subtle"
          style={{ left: `${Math.min(85, Math.max(15, ((active.x + active.w / 2) / W) * 100))}%` }}
        >
          <p className="text-numeric-meta text-text-primary">
            {money(active.point.revenue)}
          </p>
          <p className="text-micro text-text-muted">{shortDate(active.point.date)}</p>
        </div>
      ) : null}
      <div className="mt-1.5 flex justify-between text-meta text-text-muted">
        <span>{shortDate(points[0]!.date)}</span>
        <span>{shortDate(points[points.length - 1]!.date)}</span>
      </div>
    </div>
  );
}
