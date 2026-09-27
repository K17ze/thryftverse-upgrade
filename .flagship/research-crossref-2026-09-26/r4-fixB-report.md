# r4-fixB — Inbox/chat parity: composer+thread safety warnings, real message-action grammar (retry/forward/save/report/pin), extended reactions, portal-menu Tab grammar, lightbox scroll-lock migration

Workstream: the web inbox/chat surface against the native mobile chat grammar
and the real backend chat contracts. Every added action is backed by a verified
route in `backend/api/src/routes/chat.ts` or an explicit client-side analogue of
the native write; anything the contract can't carry is gated out rather than
fabricated. `tsc --noEmit` clean; eslint clean on every touched file.

## 1. [HIGH] Composer-time safety detection — FIXED

**Native reference:** `frontend/src/utils/chatSafetyWarnings.ts`
(`detectComposerSafetyWarning`), `frontend/src/hooks/chat/useConversationSafety.ts`
(re-scan per keystroke, warn-never-prevent semantics).

**Changes (`web/src/components/inbox/`):**
- `chatSafety.ts` (new) — both pattern lists ported verbatim from mobile
  (OFF_PLATFORM_PAYMENT_PATTERNS, SCAM_URGENCY_PATTERNS), plus
  `detectComposerSafetyWarning(text)` returning the identical warning objects
  (danger → dismissible for the composer variant, caution → dismissible).
- `Composer.tsx` — per-change scan in the textarea `onChange`
  (`Composer.tsx:737-740`); the warning renders as the `ChatSafetyBanner`
  strip above the input row (`Composer.tsx:583-590`). Non-blocking: send
  always proceeds. Clearing the draft (submit or a clean retype) clears both
  the warning and its dismissal, so a new risky draft warns again
  (`Composer.tsx:352-354`). Quick-reply inserts re-scan programmatically
  since `setValue` bypasses `onChange` (`Composer.tsx:701-705`).

## 2. [HIGH] Thread safety warnings — role-aware + standing reminder — FIXED

**Native reference:** `detectChatSafetyWarning` +
`classifyConversation` (`frontend/src/utils/conversationClassification.ts`).
Mobile gates the whole feature on `isBuying && isMarketplace` — sellers and
plain DMs never see buyer-protection copy.

**Changes:**
- `chatSafety.ts` — `detectThreadSafetyWarning(messages, { isMarketplace,
  isSelling })`: danger on incoming off-platform payment grammar
  (non-dismissible), caution on high-pressure grammar (dismissible), and the
  native standing info row on a clean marketplace-buyer thread
  ("Never pay outside Thryftverse. Use checkout for buyer protection.").
  Non-marketplace and seller-side threads return null.
- `services/chat.ts` — `ConversationMarketplaceMeta` + `attachMarketplaceMeta`:
  live conversation payloads carry `itemId` / `ownerId` / `context.listing.id`
  beyond the declared contract; they are attached as a non-contract
  `marketplace` field (same grammar as `messageHistory`) and read via
  `marketplaceMeta(c)`. Fixture threads already carry `listing`.
- `ChatPanel.tsx` — the role context is derived from
  `conversation.listing` / `marketplaceMeta(conversation)` (marketplace) and
  `ownerId`/`participantId` vs viewer (selling), then
  `detectThreadSafetyWarning` runs over the loaded history
  (`ChatPanel.tsx:433-462`). The banner renders above the stream
  (`ChatPanel.tsx:1075-1081`); danger pins, caution/info dismiss by level.

**Deliberate deviation:** the web thread scan tests *incoming* bodies only
(`incomingTexts` filters own/system/tombstone rows). Native scans all bodies,
but the copy reads "This user may be asking…" — the viewer's own outgoing
text is covered by the composer detector instead, which is the truthful split.

## 3. [HIGH] Message-action grammar — only real contracts — FIXED

`MessageActionsMenu` (`MessageBubble.tsx`) and its ChatPanel wiring now mirror
`frontend/src/utils/messageContextMenuCapabilities.ts`:

- **Retry / Remove** — failed optimistic sends keep their bubble, lose the
  false "sending" receipt (`failed` prop, `MessageBubble.tsx:886`), render a
  "Not delivered" affordance (`ChatPanel.tsx:1264-1274`), and offer Retry
  (re-runs the identical `SendChatMessageInput` held in `pendingInputs`) or
  Remove (local discard — no server edge exists for a message that never
  landed). `ChatPanel.tsx:695-734`.
- **Forward** — `forwardPayloadFor` / `forwardableMessage` /
  `useForwardMessage` (`chat-queries.ts:488-608`). There is no forward
  endpoint; the payload re-sends through the normal send edge. Only kinds the
  send contract carries forward faithfully: text, image/video, document,
  voice. Offers, listing shares, system rows, tombstones are gated out.
  Live-mode blob:/data: media can't re-send (no upload path), so
  local-URI-only messages aren't forwardable live — caption text still can
  be. `ForwardSheet.tsx` (new) is the recipient picker — real conversations
  minus the current thread, searchable, on the shared `Sheet` primitive.
- **Save / Unsave** — `POST/DELETE /messages/:id/save`
  (`backend/api/src/routes/chat.ts:3527,3581`) via `saveChatMessage` /
  `unsaveChatMessage` (`chat.ts:427-458`), optimistic `savedBy`/`savedAt`
  through `useThreadActions.toggleSave` with revert + toast
  (`chat-queries.ts:397-442`). `savedBy`/`savedAt` are surfaced from the
  serializer (`attachSaveState`, `chat.ts:194-204`; the backend joins
  `chat_message_saves` at `routes/chat.ts:724-837`). The menu label flips
  on `isSavedByMe`; a deleted-for-everyone tombstone offers only Unsave —
  the backend explicitly permits retracting a save on a tombstone
  (`routes/chat.ts:3592`).
- **Report** — `reportChatMessage` (`chat-queries.ts:696-711`) hits
  `POST /chat/conversations/:id/report` (`routes/chat.ts:3987`) with the
  mobile ChatSheets grammar: fixed `'other'` reason, the message id as the
  validated evidence ref, deterministic `rpt_<conv>_<msg>` idempotency key.
  No fabricated message-report sheet — the mobile flow is fire-and-acknowledge.
  Gated to non-own, non-system messages.
- **Pin / Unpin** — `POST/DELETE /messages/:id/pin` +
  `GET /pinned-message` (`routes/chat.ts:3631,3671,3697`) via
  `pinChatMessage` / `unpinChatMessage` / `fetchPinnedMessage`
  (`chat.ts:509-555`) and `usePinnedMessage` (`chat-queries.ts:633-665`).
  The menu entry renders only when the viewer is a verified group
  owner/admin (`isGroupManager`, `ChatPanel.tsx:280-281`) — the backend
  enforces the same gate, so DMs and members never see it. The pinned bar
  (`ChatPanel.tsx:1010-1040`) resolves the pinned message from the loaded
  stream or the serialized pin response, scrolls to it on tap
  (`scrollToMessage`, honest "outside the loaded history" toast when the
  parent scrolled out), and offers unpin to admins only. The poll tick
  doubles as the convergence trigger (web has no realtime topic; mobile's
  `chat.message.pinned` events map to the refetch cadence).
- Existing reply/react/copy/edit/delete kept their gates; tombstones offer
  nothing else.

## 4. [MEDIUM] Extended emoji reaction set — FIXED

`EXTENDED_REACTIONS` (`chat-queries.ts:39-43`) ports mobile's
`EmojiReactionsBar` EXTENDED_EMOJIS verbatim (18 emoji). The actions menu's
"+" expander toggles the extended grid without closing the menu
(`MessageBubble.tsx:557-579`); every chip reflects `hasReacted` via the
`reactedByMe`/`userIds` lookup, and picks go through the real
`toggleReaction` mutation (optimistic + revert on the reactions edge).
The expander carries `role="menuitem"` so arrow navigation reaches it —
with Tab now exiting the menu it would otherwise be keyboard-unreachable.

## 5. [MEDIUM] Portal-menu Tab grammar — FIXED (FeedItemMenu pattern)

`FeedItemMenu.tsx:198-208` sets the contract: Tab closes the menu, focus
moves back to the trigger, the browser's default tab step (no
preventDefault) continues from it — an open portal past its Tab position
strands the order. Applied to:

- `ConversationRowMenu.tsx:70-77`
- `MessageActionsMenu` (`MessageBubble.tsx:465-475`) — restores focus to the
  recorded opener, same as Escape/item-pick.
- `Composer` quick-replies (`Composer.tsx:678-685`) — plus focus now moves
  into the menu on open (`Composer.tsx:189-193`), matching the grammar.
- `AccountMenu.tsx:60-65` — same close-and-restore.

Escape/arrow/Home/End behavior was already correct in all four.

## 6. [LOW] `SharedMediaGrid` lightbox scroll lock — FIXED

The lightbox's direct `document.body.style.overflow` write/restore is
replaced with the shared refcounted `lockBodyScroll()`
(`web/src/lib/a11y/scrollLock.ts`) — `SharedMediaGrid.tsx:301-309`. Focus
capture/restore, Escape, and arrow paging are unchanged. Stacked overlays
can no longer unlock the body out from under each other.

## 7. Duplicate lightbox mount — FIXED (found during verification)

`ChatPanel.tsx` briefly rendered two identical `MediaLightbox` instances on
`mediaIndex !== null` (a residue of partial edits). The overlay now mounts
once, in the bottom overlay cluster (`ChatPanel.tsx:1476-1483`).

## Intentional omissions

- **No `ReportMessageSheet`.** Mobile's message report is fire-and-forget
  with a fixed 'other' reason; the existing `ReportSheet` is the listing/
  user support-ticket flow — a different write. A fabricated message-level
  reason picker would invent UI the product doesn't have.
- **No askAgent / poll actions.** No web agent surface or poll send/read
  contract exists in this scope; native's `askAgent` and poll votes stay
  unexposed rather than stubbed.
- **No forward endpoint assumption.** Forwarding composes a normal send;
  kinds that can't survive the send contract (offers, listing shares,
  documents live without a re-upload path) are gated off.
- **No pin outside groups / for non-admins.** The backend rejects non-admin
  writes; the menu mirrors it instead of failing at write time.
- **Fixture-mode report resolves false.** There is no fixture report store;
  the caller surfaces "couldn't submit" rather than faking a filed report.

## Files changed

- `web/src/components/inbox/chatSafety.ts` (new) — pattern lists,
  thread+composer detectors.
- `web/src/components/inbox/ChatSafetyBanner.tsx` — existing banner
  (verified props/tones).
- `web/src/components/inbox/Composer.tsx` — draft warning state + per-change
  scan + send/quick-reply clearing; quick-replies focus-on-open, Escape,
  Tab.
- `web/src/components/inbox/ChatPanel.tsx` — role ctx + banner render,
  failed-send tracking + retry/discard, forward/save/report/pin wiring +
  pinned bar, menu capability gates, duplicate lightbox removal.
- `web/src/components/inbox/MessageBubble.tsx` — `failed` prop + receipt
  suppression; MessageActionsMenu Retry/Forward/Pin/Save/Report/Remove rows,
  extended-emoji expander with reactedByMe, Tab + opener-focus restore.
- `web/src/components/inbox/ForwardSheet.tsx` (new) — recipient picker on
  `Sheet`.
- `web/src/components/inbox/ConversationRowMenu.tsx`,
  `web/src/components/layout/AccountMenu.tsx` — Tab grammar.
- `web/src/components/inbox/SharedMediaGrid.tsx` — `lockBodyScroll`
  migration.
- `web/src/lib/api/services/chat.ts` — marketplace meta attach/read,
  save-state surface, save/unsave, report, pin/unpin, pinned-message fetch
  (all surgical additions; no existing method signatures changed).
- `web/src/lib/hooks/chat-queries.ts` — EXTENDED_REACTIONS,
  `useThreadActions` save methods, `forwardPayloadFor` /
  `forwardableMessage` / `useForwardMessage`, `usePinnedMessage` /
  `writePinnedMessage`, `reportChatMessage`.

## Verification

- `npx tsc --noEmit` — clean (exit 0), run after final edits.
- `npx eslint` on all touched files — clean (exit 0).
- Backend routes re-verified against `backend/api/src/routes/chat.ts`
  (save 3527/3581, pin 3631/3671, pinned-message 3697-3738, report 3987+,
  report reason enum 3992-3999, evidence-message membership check 4012-4021).
- Native parity spot-checked: emoji sets and safety pattern lists match
  `EmojiReactionsBar.tsx:22-28` and `chatSafetyWarnings.ts` verbatim;
  `detectChatSafetyWarning` role gate mirrors `classifyConversation`.
- No test suite exists under `web/` (no `*.test.*`/`*.spec.*` files).

## Known limitations / flags

- **No realtime convergence for pins/saves.** The web inbox polls; another
  participant's pin or save arrives on the conversation refetch cadence,
  not instantly (mobile uses `chat.message.pinned`/`chat.message.saved`
  topics). The pinned bar's poll-tick refresh mirrors the closest honest
  analogue.
- **`writePinnedMessage` param reads `pinned` = "currently pinned"** — the
  caller passes the current state and the function issues the inverse write;
  kept to match the call-site naming, documented in the JSDoc.
- **Pinned bar + scroll target**: a pin whose message scrolled out of the
  loaded window shows the serialized preview, but tap-to-scroll reports
  "outside the loaded history" rather than paging older history in — honest
  no-op, no fabricated jump. A follow-up could wire history paging.
- **`layout/AccountMenu.tsx`** sits just outside the named inbox scope but
  is the only remaining same-grammar portal menu; the one-line-pattern Tab
  fix was applied there for consistency rather than leaving the defect.
