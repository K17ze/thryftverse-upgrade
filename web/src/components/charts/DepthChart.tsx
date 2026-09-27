'use client';

/** DepthChart — cumulative bid/ask depth around the mid price. One-sided
 * books still render — a market with only asks or only bids is real
 * information, not an error. */

interface Level {
  unitPriceGbp: number;
  units: number;
}

export function DepthChart({
  bids,
  asks,
  height = 180,
}: {
  /** Descending by price. */
  bids: Level[];
  /** Ascending by price. */
  asks: Level[];
  height?: number;
}) {
  const W = 800;
  const H = height;
  const PAD_R = 56;

  if (bids.length === 0 && asks.length === 0) {
    return <div className="rounded-lg bg-surface-alt" style={{ height }} aria-hidden="true" />;
  }

  const prices = [
    ...bids.map((l) => l.unitPriceGbp),
    ...asks.map((l) => l.unitPriceGbp),
  ];
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  // A missing side pads its edge so a flat single-price book still spans.
  const pad = Math.max((rawMax - rawMin) * 0.1, rawMin * 0.005, 0.25);
  const min = rawMin - (bids.length === 0 ? pad : 0);
  const max = rawMax + (asks.length === 0 ? pad : 0);
  const span = max - min || 1;
  const maxCum = Math.max(
    bids.reduce((s, l) => s + l.units, 0),
    asks.reduce((s, l) => s + l.units, 0),
    1,
  );
  const px = (p: number) => ((p - min) / span) * (W - PAD_R);
  const py = (q: number) => H - 4 - (q / maxCum) * (H - 16);

  let cum = 0;
  const bidPts = bids.map((l) => {
    cum += l.units;
    return `${px(l.unitPriceGbp).toFixed(1)},${py(cum).toFixed(1)}`;
  });
  cum = 0;
  const askPts = asks.map((l) => {
    cum += l.units;
    return `${px(l.unitPriceGbp).toFixed(1)},${py(cum).toFixed(1)}`;
  });

  const bidTotal = bids.reduce((s, l) => s + l.units, 0);
  const askTotal = asks.reduce((s, l) => s + l.units, 0);
  const ariaBits: string[] = [];
  if (bids.length > 0) {
    ariaBits.push(
      `${bidTotal} units bid across ${bids.length} levels down to £${rawMin.toFixed(2)}`,
    );
  } else {
    ariaBits.push('no bids resting');
  }
  if (asks.length > 0) {
    ariaBits.push(
      `${askTotal} units offered across ${asks.length} levels up to £${rawMax.toFixed(2)}`,
    );
  } else {
    ariaBits.push('no offers resting');
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: H }}
      role="img"
      aria-label={`Market depth — ${ariaBits.join(', ')}`}
    >
      {bids.length > 0 ? (
        <path
          d={`M${px(min).toFixed(1)},${H - 4} L${bidPts.join(' L')} L${px(max).toFixed(1)},${H} L0,${H} Z`}
          fill="var(--coown-up)"
          fillOpacity={0.14}
          stroke="var(--coown-up)"
          strokeWidth={1.25}
        />
      ) : null}
      {asks.length > 0 ? (
        <path
          d={`M${px(max).toFixed(1)},${H - 4} L${askPts.join(' L')} L0,${H} Z`}
          fill="var(--coown-down)"
          fillOpacity={0.12}
          stroke="var(--coown-down)"
          strokeWidth={1.25}
        />
      ) : null}
      {bids.length > 0 && asks.length > 0 ? (
        <line x1={px((min + max) / 2)} x2={px((min + max) / 2)} y1={0} y2={H} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
      ) : null}
      <text x={W - PAD_R + 8} y={14} fontSize={11} fill="var(--text-muted)" className="tnum">
        £{max.toFixed(0)}
      </text>
      <text x={W - PAD_R + 8} y={H - 8} fontSize={11} fill="var(--text-muted)" className="tnum">
        £{min.toFixed(0)}
      </text>
    </svg>
  );
}
