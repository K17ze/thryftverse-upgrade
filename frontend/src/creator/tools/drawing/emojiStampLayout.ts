/**
 * emojiStampLayout — single deterministic layout for emoji-brush stamps.
 *
 * Authoring preview (DrawingWorkspace), canvas replay (DrawLayerContent),
 * and export all consume this layout so a stroke stamps identical glyphs
 * at identical positions/rotations on every surface. Previously each
 * consumer walked the polyline differently (per-point vs exact-spacing)
 * and jittered with Math.random vs a seeded hash — the authored result
 * never matched the replayed one.
 *
 * Positions are in the caller's coordinate space (workspace pixels, layer
 * pixels, or export pixels) — the caller scales points/spacing/size first.
 */

export interface EmojiStampPoint {
  x: number;
  y: number;
  /** Rotation in degrees, seeded — matches the authoring preview. */
  rotation: number;
}

/** Deterministic hash noise in [0,1) — stable across renders. */
export function seededJitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Walk the polyline and emit a stamp every `spacing` px (exact-spacing
 * walk: the stamp lands at the precise distance along the segment, not
 * on the nearest point sample). The first point is always stamped.
 *
 * Jitter offsets scale with stamp size (± jitter × size / 4 each axis)
 * and rotation ranges ±15° — all seeded by `seedBase` + stamp index so
 * the layout is stable for a given stroke.
 */
export function layoutEmojiStamps(
  points: { x: number; y: number }[],
  spacing: number,
  jitter: number,
  stampSize: number,
  seedBase = 0,
): EmojiStampPoint[] {
  if (points.length === 0) return [];
  const stamps: EmojiStampPoint[] = [];
  const jitterRange = jitter * stampSize * 0.5;
  const makeStamp = (x: number, y: number, j: number): EmojiStampPoint => ({
    x: x + (seededJitter(seedBase * 997 + j * 13) - 0.5) * jitterRange,
    y: y + (seededJitter(seedBase * 997 + j * 29) - 0.5) * jitterRange,
    rotation: (seededJitter(seedBase * 997 + j * 41) - 0.5) * 30,
  });

  stamps.push(makeStamp(points[0]!.x, points[0]!.y, 0));
  if (points.length === 1) return stamps;

  let accumulated = 0;
  let stampIndex = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (segLen === 0) continue;
    accumulated += segLen;
    while (accumulated >= spacing) {
      const overshoot = accumulated - spacing;
      const t = 1 - overshoot / segLen;
      stampIndex += 1;
      stamps.push(makeStamp(prev.x + dx * t, prev.y + dy * t, stampIndex));
      accumulated -= spacing;
    }
  }
  return stamps;
}
