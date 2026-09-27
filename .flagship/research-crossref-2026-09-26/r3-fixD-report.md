# r3-fixD — Inbox / Notifications state-management repair report

**Status:** all 8 fixes applied. `npx tsc --noEmit` clean; `npx eslint` on all changed files clean (no output, exit 0).

## Files changed

### `web/src/components/inbox/ChatPanel.tsx`
- **P1 autoscroll (fix 1).** New `NEAR_BOTTOM_PX = 80` constant, `nearBottom` ref + `newBelow` state. The tail-watch effect now distinguishes *prepended* / *appended* (`prev.last !== last && messages.length >= prev.count` — a tail id swap on optimistic reconcile counts; a delete-for-me shrinking the list does not). Appends scroll smoothly only when `nearBottom` or the tail message `isMine`; otherwise `setNewBelow(true)` raises a non-blocking "New messages" pill. The pill sits in an `aria-live="polite"` overlay anchored to a new `relative` wrapper around the scroll container (`pointer-events-none` shell, `pointer-events-auto` button); `jumpToLatest` smooth-scrolls to the tail, and reaching the bottom manually clears the pill via `onStreamScroll`. Reset on `conversationId` switch alongside the other thread-local state.
- **P2 prepend dedupe (fix 3).** The merge keeps first-seen position but **last copy wins the payload** (`indexById` map over `[...history.older, ...conversation.messages, ...pending]`) — a boundary message present in both an older page and polled page 1 renders the fresher page-1 snapshot while staying in its prepend slot.
- Passed `threadId={conversationId}` to `<Composer>`.

### `web/src/components/inbox/MessageBubble.tsx`
- **P1 scroll-close focus-yank (fix 2).** `MessageActionsMenu` now gates the unmount focus-restore behind a `restoreOnClose` ref: set by the Escape handler and by `pick()` (item select); outside-press, touch-outside and the captured `scroll` listener call `onClose` without it. Cleanup refocuses the opener only when the flag was set — scrolling with the menu open no longer drags the stream back to the trigger.

### `web/src/components/inbox/Composer.tsx`
- **P2 draft-stash clobber (fix 4).** Replaced the single `draftBeforeEdit` slot with an `EditStashEntry[]` stack (`{ kind: 'draft' } | { kind: 'edit', id, banner, text }`). Staging edit B while editing A pushes A's in-progress edit; when B's session ends the pop **resumes A's edit** via a local `resumedEdit` state (`activeEdit = editTarget ?? resumedEdit`), and ending A restores the original draft. Submit/cancel/Escape route through `activeEdit` and a `cancelEdit` helper that clears local resumes. New optional `threadId` prop triggers a render-phase reset of stash/resumed state on conversation switch — a resumed edit in thread X can no longer land in thread Y's composer (the plain draft keeps its existing carry-over behaviour).

### `web/src/lib/hooks/chat-queries.ts`
- **P2 scoped reverts (fix 5).** `patchOlder` snapshots the target message + index and its revert patches that one entry back (re-inserting at the old slot if removed) instead of restoring the whole `older` array. `applyMessageUpdate`'s live-mode revert likewise patches only the mutated message in the `['conversation', id]` cache — replace in place, re-insert at the captured index if deleted, drop if the write introduced it — so concurrent optimistic writes to other messages survive a failure.

### `web/src/app/notifications/page.tsx`
- **P2 duplicate rows (fix 6).** `data` now dedupes `feed.pages` entries by `id`, first occurrence wins, preserving order — boundary-shift between cursor fetches can't double-render a row or collide on React keys.

### `web/src/lib/store/notificationCursor.ts`
- **P2 clearedIds growth (fix 7).** `MAX_CLEARED_IDS = 500`; `capClearedIds` (keep most-recent tail) applied in `markRead`, `markAllRead` and `partialize`. Store `version` bumped 0 → 1 with a `migrate` that prunes legacy oversized arrays on rehydrate.

### `web/src/lib/api/services/chat.ts`
- **P2 deleteChatMessage ok:false (fix 8).** File was **not** already fixed — added `if (!payload.ok) throw new Error('Failed to delete message')` after the fetch so a 200 `{ok:false}` envelope rejects the promise and the optimistic tombstone/removal reverts.

## Test result

`cd web && npx tsc --noEmit` → exit 0, no diagnostics; `npx eslint` on all 7 changed files → exit 0, no warnings.

## Concerns / notes for the orchestrator

- The near-bottom check is event-driven (`onScroll`), matching how the code already tracks scroll — a poll landing while the stream sits mid-history correctly pills; programmatic height changes that don't emit scroll events (rare) could leave `nearBottom` stale by one event. Acceptable; no ResizeObserver added to keep the diff proportional.
- Deleting the tail message for-me no longer force-scrolls (a consequence of `appended` requiring `count >= prev.count`) — strictly better than the old yank.
- Composer: a staged **photo** is still dropped when an edit begins (pre-existing; edits are text-only) and drafts still carry across threads as plain text — both unchanged from current behaviour; only edit-state leaking was made thread-safe.
- `deleteChatMessage` was unfixed on arrival; applied the `ok:false` throw. If the other workstream also patches that line, the change is identical in intent — trivial merge.
- Overlays workstream files (`FeedItemMenu.tsx`, `Sheet.tsx`, `PdpLightbox.tsx`, `queries.ts`) untouched.
