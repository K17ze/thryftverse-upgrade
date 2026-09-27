'use client';

/**
 * LineChart — generic single-series line/area in the RevenueChart grammar:
 * deterministic SVG, 1.75pt line, quiet dashed grid, crosshair readout on
 * pointer or keyboard. Flat — no axes chrome.
 */

import { useMemo, useRef, useState } from 'react';
import { ChartTooltip } from './ChartTooltip';

const PAD_Y = 14;
const PAD_X = 4;

export interface LineChartPoint {
  /** X label — date, bucket name, whatever the caller renders. */
  label: string;
  value: number;
  /** Secondary line in the readout (e.g. "3 orders"). */
  hint?: string;
}

interface LineChartProps {
  points: LineChartPoint[];
  formatValue?: (v: number) => string;
  /** Smoothed Catmull-Rom path (default) — set false for step-truthful data. */
  smooth?: boolean;
  /** Area fill under the line (default true). */
  filled?: boolean;
  height?: number;
  ariaLabel: string;
}

const defaultFormat = (v: number) => v.toLocaleString('en-GB');

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

function straightPath(coords: { x: number; y: number }[]): string {
  return coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
}

export function LineChart({
  points,
  formatValue = defaultFormat,
  smooth = true,
  filled = true,
  height = 200,
  ariaLabel,
}: LineChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradId = useRef(`line-chart-fill-${Math.random().toString(36).slice(2, 8)}`).current;

  const W = 720;
  const H = height;

  const { lineD, areaD, coords } = useMemo(() => {
    if (points.length === 0) return { lineD: '', areaD: '', coords: [] as { x: number; y: number; point: LineChartPoint }[] };
    const max = Math.max(...points.map((p) => p.value), 1);
    const span = Math.max(1, points.length - 1);
    const stepX = (W - PAD_X * 2) / span;
    const mapped = points.map((p, i) => ({
      x: PAD_X + i * stepX,
      y: PAD_Y + (1 - p.value / max) * (H - PAD_Y * 2),
      point: p,
    }));
    const line = smooth ? smoothPath(mapped) : straightPath(mapped);
    const area = `${line} L${mapped[mapped.length - 1]!.x.toFixed(1)},${H - PAD_Y} L${mapped[0]!.x.toFixed(1)},${H - PAD_Y} Z`;
    return { lineD: line, areaD: area, coords: mapped };
  }, [points, smooth, H]);

  if (points.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center border border-dashed border-border rounded-md">
        <p className="text-meta text-text-muted">No data for this period</p>
      </div>
    );
  }

  const current = active != null ? coords[active] ?? null : null;
  const last = coords[coords.length - 1]!;

  const summary = points
    .map((p) => `${p.label}: ${formatValue(p.value)}`)
    .join(', ');

  const move = (dir: number) => {
    setActive((cur) => {
      const next = (cur ?? (dir > 0 ? -1 : coords.length)) + dir;
      return Math.max(0, Math.min(coords.length - 1, next));
    });
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full outline-none"
        role="img"
        aria-label={`${ariaLabel}. ${summary}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            move(-1);
          } else if (e.key === 'Home') {
            e.preventDefault();
            setActive(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            setActive(coords.length - 1);
          } else if (e.key === 'Escape') {
            setActive(null);
            svgRef.current?.blur();
          }
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
        {filled ? <path d={areaD} fill={`url(#${gradId})`} className="text-brand" /> : null}
        <path
          d={lineD}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand"
        />
        {current ? (
          <g>
            <line
              x1={current.x}
              x2={current.x}
              y1={PAD_Y}
              y2={H - PAD_Y}
              className="stroke-border"
              strokeWidth={1}
            />
            <circle cx={current.x} cy={current.y} r={3.5} className="fill-brand" />
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
            setActive(Math.max(0, Math.min(points.length - 1, idx)));
          }}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {current ? (
        <ChartTooltip leftPct={(current.x / W) * 100}>
          <p className="tnum text-numeric-meta text-text-primary">
            {formatValue(current.point.value)}
          </p>
          <p className="text-micro text-text-muted">{current.point.label}</p>
          {current.point.hint ? (
            <p className="text-micro text-text-muted">{current.point.hint}</p>
          ) : null}
        </ChartTooltip>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {current
          ? `${current.point.label}: ${formatValue(current.point.value)}${current.point.hint ? `, ${current.point.hint}` : ''}`
          : ''}
      </p>
      <div className="mt-1.5 flex justify-between text-meta text-text-muted">
        <span>{points[0]!.label}</span>
        {points.length > 2 ? <span>{points[Math.floor(points.length / 2)]!.label}</span> : null}
        <span>{points[points.length - 1]!.label}</span>
      </div>
    </div>
  );
}
