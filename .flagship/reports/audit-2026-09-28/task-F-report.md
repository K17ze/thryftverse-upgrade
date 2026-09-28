# Task F — Chat accessibility + swipe gesture cleanup (findings 21, 22)

**Status: DONE.** Files owned and changed:

- `frontend/src/components/chat/MessageBubble.tsx`
- `frontend/src/components/SwipeableMessage.tsx`
- `frontend/src/__tests__/messageBubbleA11y.test.tsx` (new)
- `frontend/src/i18n/locales/en.json` (keys added under `messaging.messageActions` — permitted scope)

No existing files outside this list were touched; no git state changes; no new
dependencies; hardcoded-EN copy convention preserved (consistent with every
other accessibility label in this file).

## Finding 21 (P1) — coherent accessible message node

**Before:** `MessageBubble.tsx` bubble Pressable declared
`accessibilityRole="button"` with only `onLongPress` — TalkBack/VoiceOver
announced a button that normal activation (double-tap) could not fire, and
`SwipeableMessage`'s swipe-to-reply gesture had no screen-reader equivalent.

**After:** the bubble is one accessible node whose named
`accessibilityActions`/`onAccessibilityAction` (RN 0.86 supports custom actions
on both TalkBack's actions menu and VoiceOver's rotor — same convention as
`SwipeableRow.tsx` and `LookCommentsSheet.tsx`) mirror exactly what the
gestures and nested controls actually offer:

| action | when exposed | invokes |
| --- | --- | --- |
| `activate` | any bubble affordance exists | media/document open if present, else the same actions menu as long-press |
| `reply` ("Reply") | wrapped in `SwipeableMessage` on an incoming message | the *same* callback the swipe commits to |
| `longpress` ("Show message actions") | `onLongPress` | context menu (reply/react/forward/save/copy/… live inside it) |
| `openMedia` ("Open photo/video") | `mediaUri` + `onMediaPress` | media viewer |
| `openDocument` ("Open document") | `documentUri` | same `Linking.openURL` path as the nested control |
| `showRepliedMessage` ("Go to replied message") | `replyTo` + `onReplyPress` | quote-jump |

Key decisions:

- **Activation routed through the action channel, not `onPress`.** Sighted
  single-tap behaviour is unchanged (taps on nested pressables, or inert).
  `activate` is registered as a standard action and dispatched via
  `onAccessibilityAction`, so SR double-tap does something truthful: opens the
  photo/video/document the message is announced as, or the actions menu for
  plain text. `accessibilityHint` states that outcome verbatim.
- **Role is honest:** `accessibilityRole="button"` only when at least one
  action exists; a message with no handlers is role `text`.
- **Swipe↔a11y wiring without touching consumers.** Consumers
  (`ChatMessageItem`, `GroupChatScreen`) are not owned files, so
  `SwipeableMessage` now exports `SwipeReplyContext` — a `(() => void) | null`
  provided only when `!isMe && onReply` (the direction the gesture actually
  offers). `MessageBubble` consumes it, so the announced `reply` action fires
  the identical `onSwipeReply(msg)` callback — quoted-message context is
  preserved by construction.
- **Own messages:** the leftward swipe opens the same actions menu the
  `longpress` action already announces; no duplicate `reply` action is added.
- **Nested controls** (reply-quote block, media, document, translate toggle)
  keep their own labels and handlers — no focus stops added, none removed; on
  platforms where the parent element flattens children, every nested capability
  is mirrored as a named action so nothing becomes unreachable.

## Finding 22 (P2) — gesture cleanup + single haptic

**Before:** displacement reset only in `onEnd`; fail/cancel/interruption paths
(`failOffsetY`, lost responder, navigation) could retain translation
(source-level risk, not a reproduced stuck bubble — matching the audit's
framing). Two haptics per committed swipe: threshold-cross `haptic.light()` +
fire-time `haptic.light()`.

**After:**

- `onEnd` now contains **commit logic only**. Unconditional reset
  (`translateX → withTiming(0)`, `hasTriggeredHaptic → false`) moved to
  **`onFinalize`**, which RNGH ≥2.x invokes after end/fail/cancel/interruption
  (`onFinalize` is already the codebase's convention for this —
  `DrawingCanvas.tsx`, `LayerRenderer.tsx` comment).
- `gesture.onFinalize?.(...)` is an optional call because the immutable
  existing `swipeableMessage.test.tsx` gesture double doesn't stub
  `onFinalize`; production RNGH 2.32 always provides it. Noted inline.
- **One deliberate haptic:** the threshold-commitment `haptic.selection()`
  (same token `SwipeableRow` uses for its commit point — it tells the user
  "release now to act"), fired once per crossing; the second fire-time haptic
  was removed because the action's visible outcome (reply preview / actions
  sheet) is the confirmation. Justification for keeping threshold rather than
  fire-time: the haptic must occur *before* release to be useful as a
  commit-point signal.
- Swipe still fires reply with the same callback — quoted context intact; the
  a11y `reply` action shares it too.

## Verification

- `npx vitest run src/__tests__/messageBubbleA11y.test.tsx` — **11/11 pass**:
  actions mirror available handlers; `reply`/`longpress`/`activate` dispatch to
  the right callbacks; no `reply` on own messages; media bubble keeps its
  nested `Open photo` button *and* mirrors it as an action; finalize resets
  translation on both end and interrupted paths; exactly one haptic per
  committed swipe.
- Existing chat suites all pass unchanged: `swipeableMessage` (3),
  `chatRuntimeBehaviour` (55), `agentChatParity` (?), `chatComposerStack` (10),
  `groupChatInfoParity` (24), `vq09cChatSafetyProvenance` (12),
  `accessibilityAcceptance` (5) — **119 total, 0 failures**.
- `npx tsc --noEmit` — **clean for all owned files**. The only errors repo-wide
  are 4 pre-existing TS2367 errors in `src/__tests__/coownFinancialReadability.test.tsx`,
  an untracked in-flight file owned by Task A (not mine; left untouched per
  ownership boundaries).

## Caveats / hand-off notes

- `accessibilityActions` covers both platforms on RN 0.86; native TalkBack/
  VoiceOver pass remains pending (audit acknowledges no connected device).
- The `SwipeReplyContext` indirection exists because Task F's file ownership
  excludes the consumers (`ChatMessageItem.tsx`, `GroupChatScreen.tsx`). If a
  future task owns those files, passing an explicit prop would be an equally
  valid — but not simpler — alternative; context keeps the gesture/a11y pair
  correct by construction at any nesting depth.
- `hasFailed`/`isDraft` outer badges (`Tap to retry`, `Send`) were already
  separate accessible elements outside the bubble Pressable — unchanged.

## Review fix — MINOR: route new a11y strings through `t()`

The accessibility action labels and activate hints introduced in this diff
were hardcoded English; `useAppTranslation('messaging')` was already in scope.
Fixed:

- Added 11 keys under the existing `messaging.messageActions` group in
  `frontend/src/i18n/locales/en.json` (camelCase + `Hint` suffix, matching
  `dismissReply`/`scrollToOriginal`/`exitSelectionModeHint` style):
  `reply`, `showMessageActions`, `openPhoto`, `openVideo`, `openDocument`,
  `goToRepliedMessage`, `replyHint`, `openPhotoHint`, `openVideoHint`,
  `openDocumentHint`, `showMessageActionsHint`. Non-English locales fall back
  to English per the flattened-key merge convention in
  `src/i18n/locales/index.ts` — accepted infra, no other locale files touched.
- `MessageBubble.tsx` now resolves all action labels and the activate hint via
  `t('messageActions.*')` (bare group keys — same style as the existing
  `t('conversation.savedInChat')` calls in this file; the `messaging` ns is the
  hook's primary namespace).
- Test mock for `useAppTranslation` now resolves real English by flattening
  `en.json`'s `messaging` namespace (same algorithm as the production loader),
  so assertions verify announced copy end-to-end — a missing key would surface
  as the raw key string and fail.

Pre-existing hardcoded accessibility strings elsewhere in `MessageBubble.tsx`
(e.g. the composed `a11yLabel`, 'Tap to retry') predate this diff and were left
as-is — out of the flagged scope; noted for a future copy pass.

Re-verification after fix: `messageBubbleA11y.test.tsx` 11/11, plus
`chatRuntimeBehaviour.test.ts` (55) and `swipeableMessage.test.tsx` (3) —
69/69 pass. `npx tsc --noEmit` now reports **0 errors repo-wide** (Task A's
previously-failing test file was fixed in-flight).
