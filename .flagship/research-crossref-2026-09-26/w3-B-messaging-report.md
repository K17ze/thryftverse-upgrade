# W3-B Messaging — Implementation Report

**Date:** 2026-09-26 · **Scope:** web inbox / notifications / support dept
**Reference:** `.flagship/research-crossref-2026-09-26/messaging.md`

## Endpoints wired

| Capability | Endpoint / mechanism | Where |
|---|---|---|
| Load older messages | `GET /chat/conversations/:id/messages?limit&before={oldestCursor}` — envelope `oldestCursor`/`newestCursor`/`hasMore` now preserved (was dropped) | `lib/api/services/chat.ts` (`fetchConversationMessagesPage`, `ConversationWithHistory.messageHistory`), `lib/hooks/chat-queries.ts` (`useMessageHistory`), `ChatPanel.tsx` |
| Reactions | `POST` / `DELETE /chat/conversations/:id/messages/:mid/reactions` | `chat.ts` (`addMessageReaction`/`removeMessageReaction`), `useThreadActions.toggleReaction` |
| Edit message | `PATCH /chat/conversations/:id/messages/:mid` (15-min window, mirrored client-side) | `chat.ts` (`editChatMessage`), `useThreadActions.editMessage`, `MESSAGE_EDIT_WINDOW_MS` |
| Delete message | `DELETE /chat/conversations/:id/messages/:mid?scope=me\|everyone` | `chat.ts` (`deleteChatMessage`), `useThreadActions.deleteMessage`, ConfirmSheet confirm |
| Notifications pagination | `GET /notifications/events?cursor&limit` — `nextCursor` wired (was dropped) | `components/notifications/useNotificationFeed.ts` (`useInfiniteQuery`), `app/notifications/page.tsx` |

## What shipped

1. **Load older** — `fetchConversation` attaches `messageHistory { oldestCursor, hasMore }` to the conversation object (non-contract field, read via `messageHistoryMeta`). Older pages live in `useMessageHistory` state, *outside* the `['conversation', id]` cache so the 15s poll can't drop prepended history (mobile `useConversationMessages` parity — tail cursor kept once paged). UI: "Load older messages" button at stream top + auto-load on scroll-top (<64px), scroll position preserved via pre-measured scrollHeight delta; loading/error/end ("Beginning of conversation") states; prepend never triggers the bottom auto-scroll (first/last-id window tracking). Dedupe by id at the merge seam.

2. **Reactions** — quick-react row (mobile `MessageContextMenu` default set ❤️👍😂😮😢🔥) heads `MessageActionsMenu` with `menuitemradio`/`aria-checked`; "React" added to the hover gutter; existing reaction chips are now toggle buttons (`aria-pressed`). Optimistic toggle into the conversation cache **and** paged history, revert + toast on failure; fixture mode mutates `CONVERSATIONS` (store grammar).

3. **Edit / delete** — "Edit message" (own text messages ≤15 min; offer/media/voice/document/listing-share bodies excluded) stages composer edit mode: prefill, "Edit message" bar, Escape/× cancel, pre-edit draft stash+restore, attach/quick-replies hidden. "Delete for me" (any message) and "Delete for everyone" (own only, danger-styled) both confirm via `ConfirmSheet`; tombstones strip payload fields (text/media/reactions/offer) so nothing leaks.

4. **Typing indicator — NOT implemented.** No realtime transport exists on web (no websocket/SSE seam; the only "typing" code is the simulated assistant tick in `components/convsearch/`). Per constraints, not faked. The 15s `useConversation` poll remains the sync mechanism. **Platform gap** — needs a web realtime client (mobile: `services/realtimeClient.ts`) before typing/presence-push can ship.

5. **In-thread safety** — `chatSafety.ts` ports mobile `OFF_PLATFORM_PAYMENT_PATTERNS` + `SCAM_URGENCY_PATTERNS` verbatim, scanning **incoming** (non-mine, non-system, non-deleted) message text only. Danger (off-platform payment) pins non-dismissible; caution (pressure tactics) dismisses per-thread-visit. `ChatSafetyBanner` renders above the stream with `role="alert"`, mobile-matched level grammar. The mobile always-on "buyer protection" info row was *not* ported — it needs `classifyConversation` (isBuying/isMarketplace) data the web Conversation contract doesn't carry, and firing it unconditionally would be decoration.

6. **Unread filter** — `SegmentedControl` gains Unread (count = unread threads), filtering on the **raw** (pre-mute-suppression) unread flag via `rawUnreadById`, so muted-but-unread threads still surface with their dimmed badge (WhatsApp grammar). Empty state "All caught up". Wrapper got `overflow-x-auto` for the 4th tab in the 340px column.

7. **Notifications pagination** — `useNotificationFeed` (new, `components/notifications/`) uses `useInfiniteQuery` on its own key `['notification-feed']` (the flat `['notification-entries']` array shape is still consumed by `components/layout/Header.tsx` — untouched). Page flattens pages → same overlay/filter/group pipeline; "Load more" button with loading + retry states; fixture mode = one honest page (no button). Mark-all invalidates both keys.

8. **Offer fallback honesty** — `offerResolutionForMessage` returns `{ offer, via: 'offerId'|'listing'|null }`; cards resolved by listing fallback render "Current standing offer on this item" caption so a historical offer card can't masquerade as its own record. `offerForMessage` kept as a compat wrapper.

## Files changed

- `web/src/lib/api/services/chat.ts` — messages envelope + `messageHistory` meta, `fetchConversationMessagesPage`, `editChatMessage`, `deleteChatMessage`, `addMessageReaction`, `removeMessageReaction`
- `web/src/lib/hooks/chat-queries.ts` — **new**: `useMessageHistory`, `useThreadActions`, `toggleReactionOnMessage`, `QUICK_REACTIONS`, `MESSAGE_EDIT_WINDOW_MS`
- `web/src/components/inbox/ChatPanel.tsx` — history merge + scroll preservation + load-older UI, actions menu wiring, edit staging, ConfirmSheet, safety banner, standing-offer prop
- `web/src/components/inbox/MessageBubble.tsx` — menu (reactions row, Edit, Delete×2, arrow-key roving, focus-in/focus-restore, viewport clamp), gutter React button, toggleable chips
- `web/src/components/inbox/Composer.tsx` — edit mode (prefill/edit bar/draft restore/Escape), grow→useCallback
- `web/src/components/inbox/chatSafety.ts` — **new**: ported detector
- `web/src/components/inbox/ChatSafetyBanner.tsx` — **new**: banner component
- `web/src/components/inbox/OfferCard.tsx` — `standing` caption, gutter onReact
- `web/src/components/inbox/ListingShareCard.tsx` — gutter onReact
- `web/src/components/inbox/useChatOffers.ts` — `offerResolutionForMessage` (provenance), `offerForMessage` wrapper
- `web/src/components/inbox/ConversationList.tsx` — Unread tab
- `web/src/components/notifications/useNotificationFeed.ts` — **new**: paginated feed hook
- `web/src/app/notifications/page.tsx` — feed hook + Load more

## Verification

- `npx tsc --noEmit` — **0 errors in owned files**. Remaining errors are parallel agents' in-flight work: `lib/hooks/collections-queries.ts` (CollectionPatch null), `lib/hooks/seller-queries.ts` (MY_LISTING_STATS), `app/profile|u/[username]/page.tsx` (ShopRail casing/member).
- `npx eslint <all 13 changed files>` — clean, 0 warnings.

## Caveats / hand-offs

- **Typing indicator** — blocked on a web realtime transport (mobile `realtimeClient.ts` websocket); not faked.
- **Safety banner** — caution dismissal is per-thread-visit (component state), not persisted; danger pins by design (mobile parity). The isBuying-gated info row needs conversation-classification data the web contract lacks.
- **Shared file needed:** none. `queries.ts` left read-only; `Header.tsx` keeps its flat entries reader (separate query key).
- Menu focus restore returns focus to the element active at open (WCAG); emoji row uses `menuitemradio`+`aria-checked`.
