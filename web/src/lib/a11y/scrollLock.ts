/**
 * scrollLock — refcounted body-scroll lock for overlay primitives.
 *
 * `document.body.style.overflow = 'hidden'` is the scroll lock every
 * overlay shares (Sheet, PdpLightbox, …). Written naively it breaks when
 * overlays stack: closing the top one restores `overflow: ''` while a
 * sibling underneath is still open, so the page scrolls behind a modal.
 *
 * Each overlay acquires a lock on mount and releases it on cleanup —
 * the body unlocks only when the last owner releases. Releases are
 * idempotent so double-cleanup (StrictMode, conditional portals) is safe.
 */

let lockCount = 0;
let savedOverflow: string | null = null;

/** Lock body scrolling; returns an idempotent release function. */
export function lockBodyScroll(): () => void {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow ?? '';
      savedOverflow = null;
    }
  };
}
