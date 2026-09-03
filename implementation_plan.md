# Implementation Plan — Notifications & Messaging Department Flagship Upgrade

## [Overview]

Upgrade the **Notifications department** (`NotificationsScreen` + row components + filter sheet) and the **Messaging department** (`GroupChatInfoScreen` flagship + group-chat integration) to August 2026 benchmark quality (Instagram Activity tab, WhatsApp/Telegram group info, AGENTS §33–36 corpus), eliminating the AI-made silhouettes visible in the user's screenshots and hardening both departments end-to-end per §25/§31/§37.

**Diagnosed defects** (screenshot critique + full code read of both screens, cross-referenced against `docs/flagship-research/13_NOTIFICATIONS_INBOX.md` and `06_CHAT_MESSAGING.md`):

**NotificationsScreen** (`frontend/src/screens/NotificationsScreen.tsx`, 1,423 lines):
1. **Grey-wall unread signal stacking (P0, visible in screenshot).** With 27 unread rows, every row carries an unread background tint (`rowUnread`) + unread dot + heavier title — the viewport reads as one grey slab (the grey rectangle behind the filter sheet in the screenshot). §13 research: one primary signal (dot) + one secondary (semibold title). Tint reserved exclusively for the "Needs attention" section.
2. **Filter sheet is label-everything disease (P0, visible in screenshot).** Every row = 36pt grey icon-wrap + label + count pill + checkmark. Six repeated identical rows fail the thumbnail test. Redesign: remove icon wraps entirely (the object is the label), count as muted tabular-nums right-aligned, checkmark only on the selected row, selected row gets `surfaceAlt` — Telegram/Instagram filter-sheet grammar.
3. **Banned icon metaphor (P1).** `FILTER_ICONS.all = 'sparkles-outline'` — banned per §38.2. Dropping sheet icons entirely (preferred, per defect 2) resolves this.
4. **Duplicate headings (P1).** "27 unread notifications" summary banner restates the Unread pill count (27) and section headers. Remove it; keep the quiet-hours chip as a slim inline row.
5. **Aggregation copy is mechanical (P2).** "X and N others liked your item" — art-direct with objectRef-aware copy ("Sarah and 2 others saved your Vintage Leather Jacket") when `objectRef.label` exists.
6. **Section header geometry** — verify headers read as quiet hairline scaffolding (muted title + count), not pill chrome.

**GroupChatInfoScreen** (`frontend/src/screens/GroupChatInfoScreen.tsx`, ~1,156 lines):
1. **Symmetry-by-default identity block (P0, visible in screenshot).** Centered circle avatar + centered title + centered meta + 4 equal icon+label buttons = template silhouette (thumbnail test: grid of identical circles). Recompose to an authored hierarchy: full-bleed cover photo when present (already supported), otherwise a dominant identity block using the **GroupAvatarMosaic** (exists, unused here) instead of the flat blue "T" circle; name + meta anchored with intentional alignment; action row right-weighted — asymmetric, dominant object first.
2. **Placeholder-grade media (P0).** Solid brand-blue circle with "T". Use `GroupAvatarMosaic` built from member avatars; when no avatars exist, derive a calm two-tone gradient from a deterministic hash of the conversation id/title (no random values during render, §16) with the initial glyph.
4. **Duplicate entry points (P1).** Header edit + Add/Invite + Share + invite-link card in Settings — audit for redundant paths; keep one primary "Add members"/"Invite" path; Share becomes the distribution surface for an *existing* generated link.
5. **Media tab data source is local-only (P1, §37 live-signs).** `recentMedia` = last 30 messages already in the local store — with paginated history, media is silently incomplete. Wire to the backend media endpoint with loading/empty/error states; grid cap 9 stays; "View all" must navigate to a real full gallery (verify target exists).
6. **State coverage.** Verify Members "View all" target + loading/error; Settings destructive actions already in confirm sheets (good); add media loading state; invite-link pending state surfaced.

**Department hardening (both, §37):**
- Mute toggle must propagate: GroupChatInfo ↔ GroupChatScreen top bar ↔ Inbox rows ↔ notification suppression.
- Mark-as-read on Notifications must propagate to the Inbox/tab badge count.
- Notification delivery status (`queued|ticketed|sent|failed|suppressed`) renders fail-closed only — no fabricated trust signals.
- Invite link expiry (72h) surfaced truthfully; expired link → regenerate CTA, never share a dead link.
- No timer/subscription leaks; swipe actions optimistic with rollback (already present — preserve).

**Constraints:** preserve all working functionality (§8): swipe read/clear, role-specific row presenters (Social/Commerce/Auction/Financial/System — already wired), quiet hours, offline/sync banners, V2 event registry, aggregation, FlashList recycling (`getItemType`, `drawDistance`). No new dependencies.

## [Types]

No new public type families. Targeted changes:

- `NotificationsScreen.tsx`: `NotificationFilter` unchanged; delete `FILTER_ICONS` if icons are dropped from the sheet.
- `GroupChatInfoScreen.tsx`: add local `type IdentityGradient = { from: string; to: string }` (deterministic from conversation id/title); `TabKey` unchanged.
- `services/chatApi.ts`: if no media endpoint exists, add `fetchConversationMediaOnApi(conversationId, limit)` returning `Array<{ id: string; mediaUri: string; mediaType: 'image' | 'video'; senderId?: string; timestamp?: string }>`.
- Backend `routes/chat.ts`: confirm a conversation-media listing endpoint exists; if absent, add a read-only route reusing existing message-media queries (no migration — media lives on messages).

## [Files]

**Modify:**
- `frontend/src/screens/NotificationsScreen.tsx` — defects 1–6.
- `frontend/src/components/notifications/NotificationRowBase.tsx` — unread signal grammar (remove `rowUnread` tint for non-attention rows; keep dot + semibold).
- `frontend/src/components/notifications/SocialNotificationRow.tsx`, `CommerceNotificationRow.tsx`, `AuctionNotificationRow.tsx`, `FinancialNotificationRow.tsx`, `SystemNotificationRow.tsx` — align with new unread grammar + objectRef-aware aggregation copy.
- `frontend/src/screens/GroupChatInfoScreen.tsx` — identity recomposition, mosaic avatar, truthful actions, media fetch states.
- `frontend/src/components/chat/GroupAvatarMosaic.tsx` — extend with deterministic-gradient fallback variant if absent.
- `frontend/src/services/chatApi.ts` — media fetch (if missing).
- `backend/api/src/routes/chat.ts` — media endpoint (only if missing).

**Do not touch:** `InboxScreen.tsx`, `GroupChatScreen.tsx`, `ChatScreen.tsx` except where propagation wiring requires a minimal hook — keep the diff proportional (§6).

## [Functions]

- `NotificationsScreen.tsx` — **modify** filter-sheet render block (~lines 1094–1153: remove icon wraps, restructure rows), `renderSectionHeader` (quiet geometry audit); **remove** `FILTER_ICONS`; **add** `buildAggregationText(card)` — objectRef-aware copy helper (pure, unit-testable).
- `GroupChatInfoScreen.tsx` — **modify** identity block JSX (~lines 276–370) and quick-action row; **replace** `handleQuickShare` with link-gated share (generate-if-missing, pending state); **add** `identityGradient(conversation)` helper (deterministic); **add** media fetch inside `MediaTab` with abort-on-unmount cleanup (no leak).
- `chatApi.ts` — **add** `fetchConversationMediaOnApi()` if missing.
- No function removals; all handlers preserved.

## [Classes]

None — function components + hooks throughout.

## [Dependencies]

None. `GroupAvatarMosaic`, `CachedImage`, `expo-clipboard`, `Share`, `ConfirmationSheet` already installed/used.

## [Testing]

- Extend existing source-based flagship tests (pattern: `frontend/src/__tests__/nativeVisualAcceptance.test.ts`): NotificationsScreen must not reference `sparkles-outline`; NotificationRowBase must not apply unread tint outside attention rows; GroupChatInfo must render `GroupAvatarMosaic`.
- Unit tests for `buildAggregationText` + `identityGradient` (pure functions).
- Run in `frontend/`: `node node_modules/typescript/bin/tsc --noEmit`, `npm test`, `npm run check:visual-gates`, `npm run lint:design-tokens`.
- Native validation via user device screenshots before/after (status `IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING` if no emulator available).

## [Implementation Order]

1. **Notification unread grammar** — `NotificationRowBase` + 5 role rows (fixes the grey wall; shared primitive first per §4).
2. **NotificationsScreen hierarchy** — remove summary banner; redesign filter sheet; drop banned icon; aggregation copy helper; section-header audit.
3. **GroupChatInfo identity recomposition** — mosaic avatar + gradient fallback + asymmetric layout.
4. **GroupChatInfo actions & truthfulness** — Search quick-action resolution, invite-link gating, redundancy audit.
5. **Media tab live-signs** — endpoint check → API fetch + loading/empty/error states.
6. **Propagation hardening** — mute/read-badge surfaces verified; fix any desync.
7. **Verify** — tsc, tests, visual gates, diff review, self-critique (thumbnail/squint) against the two screenshots.
