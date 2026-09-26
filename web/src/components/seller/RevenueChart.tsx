'use client';

/**
 * RevenueChart — the hub's dominant surface. The shared Sparkline pattern
 * scaled up: deterministic SVG, area gradient under a 1.75pt line, quiet
 * dashed grid, crosshair readout on hover. Flat — no axes chrome.
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

/** Catmull-Rom → cubic Bézier; clamped tangents keep the curve truthful. */
function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return '';
  let d = `M${coords[0]!.x.toFixed(1)},${coords[0]!.y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)]!;
    const p1 = coords[i]!;
    const p2 = coords[i + 1]!;
    const p3 = coords[Math.min(coords.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

interface ChartCoord {
  x: number;
  y: number;
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

  const { lineD, areaD, coords } = useMemo(() => {
    const max = Math.max(...points.map((p) => p.revenue), 1);
    const stepX = (W - 8) / Math.max(1, points.length - 1);
    const mapped: ChartCoord[] = points.map((p, i) => ({
      x: 4 + i * stepX,
      y: PAD_Y + (1 - p.revenue / max) * (H - PAD_Y * 2),
      point: p,
    }));
    const line = smoothPath(mapped);
    const area = `${line} L${mapped[mapped.length - 1]!.x.toFixed(1)},${H - PAD_Y} L${mapped[0]!.x.toFixed(1)},${H - PAD_Y} Z`;
    return { lineD: line, areaD: area, coords: mapped };
  }, [points]);

  const active = hover != null ? coords[hover] ?? null : null;
  const last = coords[coords.length - 1]!;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id="seller-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.16} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={PAD_Y + t * (H - PAD_Y * 2)}
            y2={PAD_Y + t * (H - PAD_Y * 2)}
            className="stroke-border-subtle"
            strokeWidth={1}
            strokeDasharray="2 5"
          />
        ))}
        <path d={areaD} fill="url(#seller-revenue-fill)" />
        <path
          d={lineD}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand"
        />
        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD_Y}
              y2={H - PAD_Y}
              className="stroke-border"
              strokeWidth={1}
            />
            <circle cx={active.x} cy={active.y} r={3.5} className="fill-brand" />
          </g>
        ) : (
          <circle cx={last.x} cy={last.y} r={3} className="fill-brand" />
        )}
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
          style={{ left: `${Math.min(85, Math.max(15, (active.x / W) * 100))}%` }}
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
