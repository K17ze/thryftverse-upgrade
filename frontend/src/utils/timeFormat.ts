/**
 * Shared time-formatting utilities.
 *
 * @module timeFormat
 */

/**
 * Formats a 24-hour integer (0–23) as a 12-hour clock string with an
 * AM/PM suffix and a fixed `:00` minutes component.
 *
 * @example
 *   formatHour(0)   // "12:00 AM"
 *   formatHour(9)   // "9:00 AM"
 *   formatHour(12)  // "12:00 PM"
 *   formatHour(18)  // "6:00 PM"
 */
export function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}
