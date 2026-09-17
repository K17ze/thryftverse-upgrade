// ───────────────────────────────────────────────────────────────────────────
// safeZone — the single safe-area contract shared by every creator surface.
//
// The overlay marks canvas regions where composer chrome overlays content.
// Both composers use identical chrome geometry (52pt top bar, ~120pt bottom
// tooling), so the guide must report the same insets everywhere — otherwise a
// creator positions content against a different contract in each tool.
// The +4pt top margin keeps authored content visibly clear of the bar.
// ───────────────────────────────────────────────────────────────────────────

/** Height of the composer top bar (paddingTop = device top inset). */
export const TOP_BAR_HEIGHT = 52;
/** Height of the bottom tooling region the guide reserves. */
export const BOTTOM_CHROME_HEIGHT = 120;
/** Breathing margin below the top bar so content never sits flush under it. */
export const SAFE_ZONE_TOP_MARGIN = 4;

export function safeZoneInsets(insets: { top: number; bottom: number }) {
  return {
    top: insets.top + TOP_BAR_HEIGHT + SAFE_ZONE_TOP_MARGIN,
    bottom: insets.bottom + BOTTOM_CHROME_HEIGHT,
  };
}
