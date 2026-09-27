# r3-fixC — Overlay/menu a11y + focus repair report

**Status: DONE** — all 8 fixes implemented at the shared-primitive layer.
`tsc --noEmit` clean, `eslint` clean on all changed files (zero warnings).

## Files changed

| File | Change |
|---|---|
| `web/src/lib/a11y/scrollLock.ts` | **New.** Refcounted body-scroll lock — `lockBodyScroll()` returns an idempotent release; `body.overflow` is set on first acquire and restored on last release. |
| `web/src/lib/a11y/focus.ts` | **New.** `FOCUSABLE_SELECTOR` (excludes `tabindex="-1"` hosts + disabled controls), `focusablesIn()` (skips non-rendered nodes), `trapTabKey()` (modal Tab guard), `focusAdjacentMatch()` (sibling-anchor parking). |
| `web/src/components/ui/Sheet.tsx` | Effect split + trap + scroll lock. |
| `web/src/components/pdp/PdpLightbox.tsx` | Effect split + real focus trap + scroll lock. |
| `web/src/components/feed/FeedItemMenu.tsx` | Close-reason tracking, Tab dismissal, `aria-controls`, unmount focus parking. |
| `web/src/components/notifications/NotificationRow.tsx` | Touch-visible mark-read button. |

## Fix-by-fix

1. **Sheet focus steal** — `onClose` moved to `onCloseRef` synced by its own effect; the setup effect deps are now `[open]` only. Parent re-renders (ChatPanel 15s poll) swap the callback without re-running capture/focus/trap setup. Escape calls `onCloseRef.current()`.
2. **Sheet Shift+Tab leak** — `trapTabKey(e, dialog)` handles: Shift+Tab on shell or first → last; Tab on last → first; focus anywhere outside the dialog → pulled back to first. Empty-focusable case preventsDefault (holds on shell).
3. **Scroll-close vs focus-restore** — `FeedItemMenu` tracks a `restoreFocus` ref: set true only on Escape and non-unmounting item-select; passive closes (scroll capture listener, outside `pointerdown`, trigger toggle, Tab) leave it false, so cleanup never re-focuses (and never scrolls back). Restore path uses `focus({preventScroll:true})` + `isConnected` guard.
4. **PdpLightbox trap** — same `trapTabKey` guard on a document keydown; initial focus to the dialog shell; focus capture/restore + scroll lock split into a mount-only effect. **Bonus fix found en route:** zoom/index deps previously re-ran the whole effect, re-focusing the shell mid-interaction — now the key handler re-binds without touching focus. Zoom keys (+/z, −/0, arrow pan) unchanged.
5. **Menu Tab orphaning** — Tab/Shift+Tab inside the menu calls `setOpen(false)` and re-focuses the trigger *without* preventDefault, so the browser's native tab step continues from the tile instead of the portaled end-of-body menu. Trigger carries a belt-and-braces `onKeyDown` for the same. `aria-controls` added (open-only) pointing at the menu's `useId()`.
6. **"Not interested" focus drop** — menu items carry `unmountsTile`; on select, `parkFocusBeforeUnmount()` moves focus to the next tile's menu trigger (previous if last; `[data-feed-menu-trigger]` selector) or falls back to `#main-content`, *before* `controls.notInterested` removes the tile. Sibling focus uses native scroll-if-needed so the ring stays visible.
7. **Scroll-lock refcount** — `lockBodyScroll()` used by both Sheet and PdpLightbox; stacked overlays no longer restore `overflow` while a sibling is open.
8. **NotificationRow touch discoverability** — `opacity-0` is now scoped to `@media(hover:hover)` (established codebase grammar, e.g. `SearchLanding.tsx:192`); `focus-visible` + `group-focus-within/nrow` reveal it for keyboard users on hover-capable screens; `hover:none` viewports get it always-visible.

## Test result

`cd web && npx tsc --noEmit` + `npx eslint <6 changed files>` — **clean, zero warnings** (keyboard flows verified by code reasoning; no browser run).

## Concerns for the parent agent

- **Other direct `body.style.overflow` writers remain outside my scope**: `live/LiveViewerOverlay.tsx:85-88`, `coown/CoOwnOnboardingGate.tsx:99-102`, `inbox/SharedMediaGrid.tsx:202-205`. If any stacks with Sheet/PdpLightbox they can still clobber each other — recommend migrating them to `lockBodyScroll()`.
- **Inbox menus (`Composer.tsx`, `MessageBubble.tsx`, `ConversationRowMenu.tsx`, `AccountMenu.tsx`)** use the same `role="menu"` pattern and likely share the Tab-orphaning/scroll-restore defects — flagged for the inbox workstream owner (files excluded from my scope).
- **Stacked Sheet+lightbox Escape**: both listen on `document` keydown (bubble); if ever stacked, one Escape closes both. Rare pairing — noted, not fixed.
- `aria-controls` is emitted only while the menu exists (open) — valid per APG; some validators flag dangling refs on closed triggers, so it's conditional.
