# Algorithm Transparency — "Your Algorithm" Dashboard

## Concept

The Algorithm Transparency surface is a 2026 trust differentiator inspired by Instagram's "Your Algorithm" dashboard. It gives users full visibility into — and control over — the topics and signals that shape their feed. Instead of a black-box recommendation engine, users can see exactly which interests influence their recommendations, adjust how strongly each topic weighs, remove topics they no longer want, add new interests, and understand why specific items appear.

This is a flagship trust surface: transparency builds confidence in the marketplace, and user control over recommendations improves both satisfaction and feed quality over time.

---

## Service Architecture

### Source of truth

`src/services/algorithmTransparencyApi.ts` is the data contract and mock implementation. It exposes:

| Function | Returns | Purpose |
|---|---|---|
| `fetchAlgorithmProfile()` | `AlgorithmTransparencyProfile` | Full profile: topics, signals, recent influences, last updated |
| `updateTopicWeight(topicId, weight)` | `AlgorithmTopic \| null` | Adjust a topic's influence (low/medium/high) |
| `removeTopic(topicId)` | `boolean` | Remove a user-controllable topic |
| `addTopic(label, category)` | `AlgorithmTopic` | Add a new explicit interest |
| `fetchRecentInfluences()` | `AlgorithmSignal[]` | Last ~5 signals that shaped the feed |
| `fetchFeedExplanation(itemId)` | `AlgorithmFeedExplanation \| null` | Explain why a specific item appeared |

### Types

- **`TopicWeight`**: `'low' | 'medium' | 'high'` — never a raw number to users
- **`SignalSource`**: `'explicit' | 'implicit' | 'inferred'` — provenance of influence
- **`AlgorithmTopic`**: id, label, category, weight, source, removable, addedAt, isDemo
- **`AlgorithmSignal`**: id, label, type, weight (0–1), lastSeen, isDemo
- **`FeedExplanationReason`**: topic, source, weight contribution
- **`ConfidenceLabel`**: `'Strong match' | 'Moderate match' | 'Exploratory'` — never a percentage
- **`AlgorithmFeedExplanation`**: itemId, itemTitle, itemThumbnail, reasons, confidenceLabel, isDemo
- **`AlgorithmTransparencyProfile`**: topics, signals, recentInfluences, lastUpdated, isDemo

### Demo mode (Truthful UI)

Per AGENTS.md §11, the service is mock. `ALGORITHM_DEMO_MODE = true` is exported and every entity carries `isDemo: true`. The UI shows an honest "Algorithm data is illustrative in demo mode" indicator and never claims that changes affect a live feed.

When a real backend is wired:
1. Set `ALGORITHM_DEMO_MODE = false`
2. Replace the mock branches with real fetch calls
3. The UI layer does not need to change — the demo indicator disappears automatically

### Session persistence

The mock maintains an in-memory `sessionTopics` copy so add/remove/update operations are reflected on subsequent fetches within a session. This gives honest interactive feedback without fabricating real persistence.

---

## Screen Design

### File

`src/screens/YourAlgorithmScreen.tsx`

### First viewport

1. **Header**: "Your Algorithm" title with subtitle "The signals that shape your feed" (via `FlagshipHeader`)
2. **Demo mode banner**: "Algorithm data is illustrative in demo mode." (honest indicator)
3. **Summary strip**: flat, hairline-separated stats — # active topics, # signals, last updated
4. **"How this works" expandable**: collapsed by default, expands with Reanimated spring animation to explain topics, signals, and user controls

### Main content

**Topics that influence your feed** (the dominant panel):
- Flat list with hairline separators (no card-on-card)
- Each row: topic label, category tag, weight indicator (dots — not colour alone), source label
- Non-removable topics show a lock icon
- Tap row → Reanimated spring expand showing:
  - Weight selector (Low/Medium/High) with radio accessibility
  - Remove button (for removable topics) or "Cannot be removed" lock hint

**Recent signals** (compact list):
- Last 5 signals with label, source, time, and a relative weight bar

**Add a topic**:
- Text input + category picker (flat, inline) + Add button
- Truthful caption: "Added topics are illustrative in demo mode."

### Design compliance (AGENTS.md §4)

- **Flat composition**: hairline separators, no card-on-card, one dominant panel (topic list)
- **Radius budget**: two sizes — `Radius.md` (8px) for chips/dots, `Radius.lg` (12px) for inputs/actions
- **Type budget**: three sizes per viewport — `Type.subtitle` (stats), `Type.body` (labels), `Type.caption` (metadata)
- **Stroke grammar**: hairline separators, 1pt for inputs/outlines, 2pt reserved for selection
- **Icon grammar**: Ionicons outline family, 16–18pt metadata glyphs, consistent outline rule
- **Surface budget**: summary strip is flat (no card), topic list is the one dominant panel
- **All colors** via `useAppTheme().colors`
- **All geometry** via design tokens (`Space`, `Radius`, `Type`, `Typography`, `Control`, `Stroke`)

### State coverage (AGENTS.md §14)

| State | Treatment |
|---|---|
| Loading | Skeleton placeholders matching final geometry (summary, how-it-works, topic rows) |
| Populated | Full profile with topics, signals, add-topic form |
| Empty | "No topics yet — your feed is based on general popularity" with icon and guidance |
| Error | Error state with retry button |
| Offline | Offline banner + last saved profile (if available) |

### Accessibility

- `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` on all interactive elements
- Weight selector uses `accessibilityRole="radiogroup"` with `accessibilityRole="radio"` per option and `accessibilityState={{ selected }}`
- Expandable sections use `accessibilityState={{ expanded }}`
- Weight indicator uses dots (not colour alone) per WCAG 2.1 SC 1.4.1
- All controls meet 44pt minimum touch target via `Control.hit` and `minHeight`

### Motion

- Reanimated springs for expand/collapse animations
- `useReducedMotion` respected — springs become critically damped (instant) when reduced motion is on
- `useMotionConfig` provides the shared spring configs

---

## Feed Explanation Flow

### Component

`src/components/algorithm/FeedExplanationSheet.tsx`

### Trigger

When a user taps "Why am I seeing this?" on a feed item, the host screen:
1. Sets the `itemId` and `visible=true` on `FeedExplanationSheet`
2. The sheet fetches the explanation via `fetchFeedExplanation(itemId)`

### Sheet content

1. **Header**: "Why you're seeing this"
2. **Demo mode pill**: "Demo mode — illustrative data"
3. **Item identity**: thumbnail (64×64, `Radius.md`), title, "Appeared in your feed"
4. **Confidence indicator**: descriptive label ("Strong match" / "Moderate match" / "Exploratory") with an icon and a relative bar — never a percentage
5. **Reasons list**: each reason shows topic, source, and a relative weight contribution bar
6. **Actions**:
   - **"See more like this"** (primary, brand-filled) — signals interest in the top matching topic
   - **"Show less like this"** (secondary, surface-filled) — signals disinterest
   - **"Remove this topic"** (destructive, separated) — removes the top matching topic from the profile

### Bottom sheet integration

Uses the existing `BottomSheet` component (`import { BottomSheet } from '../BottomSheet'`) with:
- `snapPoint={0.62}` (62% of screen height)
- Spring-based entrance/exit via the sheet's built-in Reanimated physics
- Drag-to-dismiss, backdrop tap to dismiss, hardware back button support

### States

- **Loading**: spinner with "Loading explanation…"
- **Error**: "Couldn't load this explanation" with guidance
- **Populated**: full explanation with reasons and actions

---

## Settings Entry Point

### Location

`src/screens/SettingsScreen.tsx` → Preferences section

### Row

- **Icon**: `sparkles-outline`
- **Title**: "Your Algorithm"
- **Subtitle**: "Manage your recommendations"
- **Action**: navigates to `YourAlgorithm` route
- Follows the existing `SettingsRow` pattern exactly

### Search

Added to `ROUTE_METADATA` so the settings search surfaces "Your Algorithm" when users search for "algorithm", "feed", "recommendations", "topics", "signals", or "transparency".

---

## Navigation

- **Route**: `YourAlgorithm: undefined` (registered in `navigation/types.ts`)
- **Navigator**: `Stack.Screen name="YourAlgorithm"` in `AppNavigator.tsx` (lazy-loaded)
- **Props type**: `NativeStackScreenProps<RootStackParamList, 'YourAlgorithm'>`
- **Presentation**: pushed (standard hierarchy from Settings)

---

## Future Expansion

### Real backend integration
1. Set `ALGORITHM_DEMO_MODE = false` in `algorithmTransparencyApi.ts`
2. Replace mock branches with real API calls to a personalization ML model / feature store
3. The UI layer requires no changes — the demo indicator disappears automatically

### Potential additions
- **Signal-level controls**: let users mute individual signals (not just topics)
- **Topic categories**: deeper category drill-down with per-category weight dashboards
- **Explanation history**: show past explanations for transparency audit
- **Bulk actions**: "Reset all topics" or "Import interests from another platform"
- **Real-time feed preview**: show how the feed would change after weight adjustments (requires live backend)
- **Topic suggestions**: recommend topics based on inferred interests the user hasn't explicitly added
- **Feed explanation from more surfaces**: extend "Why am I seeing this?" to search results, curated collections, and Co-Own asset recommendations
