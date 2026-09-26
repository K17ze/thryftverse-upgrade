interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Skeleton block — shimmer over surfaceAlt, restrained. */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton rounded-md ${className}`} style={style} aria-hidden />;
}

/** Masonry skeleton — variable-height tiles matching the feed rhythm. */
export function MasonrySkeleton({ columns = 4 }: { columns?: number }) {
  const ratios = [0.75, 1.0, 0.8, 0.67, 0.9, 0.72];
  const cols: number[][] = Array.from({ length: columns }, () => []);
  ratios.forEach((_, i) => cols[i % columns].push(i));
  return (
    <div
      className="grid gap-1.5 px-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
      aria-busy
      aria-label="Loading feed"
    >
      {cols.map((rows, c) => (
        <div key={c} className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <Skeleton key={r} className="w-full rounded-lg" style={{ aspectRatio: String(ratios[r]) }} />
          ))}
        </div>
      ))}
    </div>
  );
}
