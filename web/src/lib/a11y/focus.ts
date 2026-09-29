/**
 * focus — shared focus utilities for overlay primitives (Sheet,
 * PdpLightbox) and portal menus (FeedItemMenu).
 */

/** Tabbable-candidate selector for focus traps. The dialog shell itself
 *  is `tabIndex={-1}` — a programmatic focus target, never a tab stop —
 *  so it's deliberately excluded; a trap that picks it up would treat
 *  "focus on the shell" as a valid cycle step and let Shift+Tab leak
 *  behind the modal on the next press. Disabled controls can't take
 *  focus and are skipped too. */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), ' +
  '[tabindex]:not([tabindex="-1"])';

/** Focusable descendants of `root` that render a box — detached and
 *  `display:none` nodes can't take focus, so traps skip them. */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

/** Modal focus guard — call from a keydown listener when
 *  `e.key === 'Tab'`. Keeps Tab/Shift+Tab cycling inside `container` and
 *  covers the leak paths a naive first/last check misses:
 *   - Shift+Tab on the container shell (tabIndex=-1, outside the
 *     focusable query) wraps to the last focusable — the native
 *     behaviour would escape behind an `aria-modal` dialog;
 *   - Tab on the last focusable wraps to the first;
 *   - focus anywhere outside the container (portal edges, programmatic
 *     moves) is pulled back in. */
export function trapTabKey(e: KeyboardEvent, container: HTMLElement): void {
  const focusables = focusablesIn(container);
  if (focusables.length === 0) {
    // Nothing inside can take focus — hold focus on the shell rather
    // than letting the browser walk out of the modal.
    e.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === container || active === first || !container.contains(active)) {
      e.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last || !container.contains(active)) {
    e.preventDefault();
    first.focus();
  }
}

/** Park focus on the primary control of the next/previous sibling group
 *  before the focused element's own group unmounts — for rows whose
 *  group root isn't itself focusable (a dismiss/remove button inside a
 *  tile, the row link a sibling). `controlSelector` picks the group's
 *  tabbable landmark (its stretched link, the tile's anchor). Returns
 *  false when no sibling group or control exists — callers decide the
 *  document-level fallback. */
export function focusAdjacentGroupControl(
  current: Element | null,
  groupSelector: string,
  controlSelector: string,
): boolean {
  const group = current?.closest?.(groupSelector);
  if (!group) return false;
  const groups = Array.from(document.querySelectorAll<HTMLElement>(groupSelector));
  const index = groups.indexOf(group as HTMLElement);
  if (index === -1) return false;
  const target = groups[index + 1] ?? groups[index - 1];
  const control = target?.querySelector<HTMLElement>(controlSelector);
  if (!control) return false;
  control.focus();
  return true;
}

/** Move focus to the next element matching `selector` in DOM order —
 *  or the previous one when the current match is last. Used before an
 *  action unmounts the focused control (e.g. a feed menu's "Not
 *  interested" removes the tile that hosts the trigger) so focus lands
 *  on a stable sibling instead of dropping to `<body>`.
 *  Returns false when no sibling match exists — callers decide the
 *  document-level fallback. */
export function focusAdjacentMatch(
  current: Element | null,
  selector: string,
): boolean {
  if (!current) return false;
  const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const index = matches.indexOf(current as HTMLElement);
  if (index === -1) return false;
  const target = matches[index + 1] ?? matches[index - 1];
  if (!target) return false;
  // No preventScroll — the native focus scroll only engages when the
  // target is off-viewport, and a just-moved focus must be visible.
  target.focus();
  return true;
}
