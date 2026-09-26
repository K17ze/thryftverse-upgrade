'use client';

/** DepthChart — cumulative bid/ask depth around the mid price. */

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

  if (bids.length === 0 || asks.length === 0) {
    return <div className="rounded-lg bg-surface-alt" style={{ height }} aria-hidden="true" />;
  }

  const min = bids[bids.length - 1]!.unitPriceGbp;
  const max = asks[asks.length - 1]!.unitPriceGbp;
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

  const bidPath = `M${px(min).toFixed(1)},${H - 4} L` + bidPts.join(' L');
  const askPath = `M${px(max).toFixed(1)},${H - 4} L` + askPts.join(' L');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label="Market depth — cumulative bids and asks around the mid price">
      <path d={`${bidPath} L${px(max).toFixed(1)},${H} L0,${H} Z`} fill="var(--coown-up)" fillOpacity={0.14} stroke="var(--coown-up)" strokeWidth={1.25} />
      <path d={`${askPath} L0,${H} Z`} fill="var(--coown-down)" fillOpacity={0.12} stroke="var(--coown-down)" strokeWidth={1.25} />
      <line x1={px((min + max) / 2)} x2={px((min + max) / 2)} y1={0} y2={H} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
      <text x={W - PAD_R + 8} y={14} fontSize={11} fill="var(--text-muted)" className="tnum">
        £{max.toFixed(0)}
      </text>
      <text x={W - PAD_R + 8} y={H - 8} fontSize={11} fill="var(--text-muted)" className="tnum">
        £{min.toFixed(0)}
      </text>
    </svg>
  );
}
