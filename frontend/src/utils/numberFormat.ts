/**
 * Compact number formatting for social/marketplace stats.
 *
 * Renders large counts the way flagship apps (Instagram, TikTok, Depop,
 * Vinted) do in profile stat rows and feed metrics:
 *
 *   0        → "0"
 *   999      → "999"
 *   1,200    → "1.2K"
 *   12,400   → "12.4K"
 *   999,999  → "999.9K"
 *   1,200,000→ "1.2M"
 *   3,400,000→ "3.4M"
 *
 * The full-precision value is preserved for accessibility labels so
 * VoiceOver/TalkBack users hear the exact count ("1,234 followers")
 * while sighted users get the scannable compact form.
 */

/**
 * Format a count using compact notation (K, M, B).
 *
 * @param value  The raw count (e.g. follower count, listing count).
 * @returns Compact string suitable for stat-row display ("1.2K", "3.4M").
 */
export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value < 1000) return String(Math.floor(value));

  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ] as const;

  for (const { threshold, suffix } of units) {
    if (value >= threshold) {
      const scaled = value / threshold;
      // 1 decimal place, but drop trailing ".0" for clean integers
      // 12.0K → 12K, 1.2K stays 1.2K
      const rounded = Math.floor(scaled * 10) / 10;
      const hasDecimal = rounded % 1 !== 0;
      return `${hasDecimal ? rounded.toFixed(1) : String(rounded)}${suffix}`;
    }
  }

  return String(Math.floor(value));
}

/**
 * Format a count with full precision for accessibility labels.
 *
 * "1,234" — grouped thousands, no compact suffix.
 * Used in accessibilityLabel so screen readers announce the exact number.
 */
export function formatFullCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  return Math.floor(value).toLocaleString('en-GB');
}
