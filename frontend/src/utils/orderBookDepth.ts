export interface DepthLevel {
  price: number;
  size: number;
  cumulative?: number;
}

/** Accumulate from the best price before reversing asks for ladder display. */
export function buildDepthRows<T extends DepthLevel>(levels: T[], reverse = false) {
  let total = 0;
  const rows = levels.map((level) => {
    total += level.size;
    return { level, cumulative: level.cumulative ?? total };
  });
  return reverse ? rows.reverse() : rows;
}
