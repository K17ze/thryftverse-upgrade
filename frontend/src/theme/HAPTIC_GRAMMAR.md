# Haptic Grammar (R115)

The product's haptic language, as implemented. Source of truth:
`src/hooks/useHaptic.ts` (primitives + gates) and
`src/utils/hapticPatterns.ts` (compound patterns). Engine patterns play
through `src/platform/haptics/HapticsEngine` (Core Haptics on iOS,
`VibrationEffect` compositions on Android API 26+).

## Principles

1. Haptics are punctuation, not a soundtrack — a haptic fires when it
   carries information (commit, outcome, boundary), never on render,
   scroll, or list taps.
2. Pair with visual feedback, never alone.
3. Respect Reduce Motion and system haptic settings.
4. If a pattern would fire more than once per second in normal use, it is
   noise, not language.

## Primitive levels

| Primitive | Semantic | Suppressed by Reduce Motion? |
|---|---|---|
| `light` | taps, selection, navigation, icon toggles | yes |
| `medium` | commit actions: purchase, bid, offer, send | yes |
| `heavy` | destructive: delete, destructive confirm, long-press reveal | yes |
| `soft` / `rigid` | iOS 16+ texture variants; fall back to light/medium | yes |
| `selection` | tab switch, segment change, picker tick | yes |
| `success` | completed purchase / win / publish | **no** — outcome signal |
| `error` | failed action | **no** — outcome signal |
| `warning` | outbid, threshold urgency | **no** — outcome signal |

Impact styles are suppressed under Reduce Motion; notification haptics
still fire because they communicate outcome, not decoration.

## Compound patterns (`haptic.patterns.*`)

| Pattern | Fires on |
|---|---|
| `like` | like/heart tap |
| `purchaseComplete` | order/payment success |
| `bidPlaced` | accepted bid |
| `outbid` | user outbid notification |
| `delete` | destructive removal |
| `feedEnd` | end-of-feed boundary |
| `refresh` | pull-to-refresh trigger |
| `tabSwitch` | tab/segment change |
| `toggle` | on/off control |
| `longPress` | long-press reveal |
| `coOwnUnit` | Co-Own unit action |
| `auctionWon` | auction win |
| `save` | save/bookmark |

## Engine patterns (`haptic.playPattern`)

`confirm`, `reject`, `gestureStart`, `gestureEnd`, `segmentTick`,
`toggleOn`, `toggleOff`, `increment`, `decrement`, `successCelebration`,
`errorShake` — richer textured sequences for high-salience moments.
No-op when the engine is unavailable.

## Platform gating

- iOS: full impact + notification + selection support.
- Android: impact styles map to `VibrationEffect` via
  `ANDROID_IMPACT_ENABLED` (currently `true`); the system vibrator setting
  is respected.
- Unsupported/absent haptics degrade silently — a call site must never
  need to know.

## Adding a haptic

1. Prefer an existing primitive or pattern — the grammar is intentionally
   small; a new word dilutes the language.
2. If genuinely new: add it to `HapticPatterns` (timed composition) or
   `HapticsEngine` (textured sequence), not inline `Haptics.*` calls at the
   call site.
3. Decide its Reduce Motion behaviour explicitly: impact class (suppress)
   or outcome class (fire).
