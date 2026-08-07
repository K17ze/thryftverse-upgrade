# Conversational Search — ThryftVerse

Natural-language search surface that lets users describe what they want in their
own words and get structured filter extraction, estimated match counts, and
refinement suggestions — all in a chat-like conversation.

> **Status:** Demo mode (keyword matching). Full AI backend is a future
> expansion. The UI is honest about this — see [Truthful Demo Mode](#truthful-demo-mode).

---

## 1. Concept

ThryftVerse's conversational search is a 2026 marketplace differentiator
inspired by Mercari × ChatGPT, eBay AI Snap, and Tilt Snap AI. Instead of
forcing the user to navigate category trees and filter sheets, they simply type:

> "Vintage denim under £50"

The assistant extracts the relevant filters (style: vintage, category: denim,
price: under £50), shows an estimated match count, and offers refinement
suggestions ("sustainable only", "in black", "size 9"). The user can keep
refining in natural language — "actually, make it under £30" — and the filters
merge incrementally. When ready, they tap **View results** to jump into the
Browse screen with all filters pre-applied.

---

## 2. Service Architecture

**File:** `src/services/conversationalSearchApi.ts`

The service exposes a clean contract that mirrors what a real conversational
search backend (LLM + retrieval) would provide. The mock implementation is
gated behind `CONVERSATIONAL_SEARCH_DEMO_MODE = true`.

### Types

| Type | Description |
|---|---|
| `SearchFilters` | Extracted filters: brands, categories, sizes, conditions, priceRange, colors, styles, sustainableOnly, `isDemo` |
| `ChatMessage` | A single chat turn: id, role, content, timestamp, suggestions, filterResults, estimatedMatchCount, `isDemo` |
| `SearchConversation` | A session: id, opening query, messages[], createdAt, `isDemo` |
| `SearchSuggestion` | A suggested starting query for the empty state |

### Public API

| Function | Purpose |
|---|---|
| `fetchSuggestions()` | Returns suggested starting queries for the empty / first-viewport state |
| `startConversation(query)` | Creates a new session, returns the user + assistant messages |
| `continueConversation(id, query)` | Adds a follow-up; merges filters with the prior turn |
| `extractFilters(query)` | Pure keyword extraction — the honest mock "engine" |
| `summariseFilters(filters)` | Human-readable summary of matched keywords |

### In-memory store

Conversations are held in an in-memory `Map<string, SearchConversation>`.
`continueConversation` mutates the stored conversation's messages array in
place; the screen re-reads it after each turn.

---

## 3. Keyword Matching Logic

The mock extraction (`extractFilters`) is **deterministic keyword matching** —
not AI, not an LLM, not GPT. This is stated honestly in the UI.

### Dictionaries

- **Brands:** nike, adidas, levi's, carhartt, patagonia, gucci, prada, etc.
- **Categories:** denim, jeans, sneakers, jacket, dress, bag, furniture, etc.
- **Colours:** black, white, navy, blue, red, green, brown, beige, etc.
- **Styles:** vintage, retro, minimalist, streetwear, y2k, mid-century, etc.
- **Sustainable keywords:** sustainable, eco, ethical, recycled, organic, etc.
- **Conditions:** "new with tags" → New with tags, "very good" → Very good, etc.

### Regex extraction

- **Price range:** `/(?:under|below|less than|max(?:imum)?)\s*[£$]?\s*(\d+)/`
  for max; `/(?:over|above|more than|min(?:imum)?)\s*[£$]?\s*(\d+)/` for min.
- **Sizes:** `/(?:size|uk|us)\s*([0-9]{1,2}|xs|s|m|l|xl|xxl)\b/i`

### Filter merging

`continueConversation` merges the new extraction with the prior assistant
turn's filters. A new "under £X" overrides the prior max; brands, categories,
sizes, etc. are deduplicated and accumulated. This lets the user say "actually,
make it under £30" and the price range updates rather than resetting.

### Estimated match count

A deterministic heuristic: start at 120 and subtract based on how many filters
are active. This is **not** a real catalogue query — the UI presents it
alongside the demo indicator so the user understands it is approximate.

---

## 4. Screen Design

**File:** `src/screens/ConversationalSearchScreen.tsx`

### First viewport

1. **Header:** "Ask ThryftVerse" with a back button
2. **Demo mode banner:** "AI search is in demo mode — using keyword matching.
   Full AI coming soon." (truthful per AGENTS.md §11)
3. **Greeting:** "What are you looking for today? Describe it in your own words."
4. **Suggested query chips** (horizontal scroll): "Vintage denim under £50",
   "Sustainable sneakers size 9", "Designer bags for winter",
   "Mid-century furniture"
5. **Input field** at the bottom with a send button

### Conversation flow

- **User bubble:** brand-tinted (`colors.brand`), right-aligned, `Radius.lg`
- **Assistant bubble:** surface (`colors.surface`), left-aligned, `Radius.lg`
- Each assistant message shows:
  - The response text (matched keywords summary + "I found X items matching")
  - **Filter chips** labelled "Matched keywords" — honest labelling
  - **View results** button → navigates to `Browse` with filters applied
  - **Refine** chips (horizontal scroll) — tap to send a refinement

### Design constraints (per AGENTS.md §4)

| Constraint | Implementation |
|---|---|
| Flat composition, hairline separators | `StyleSheet.hairlineWidth` for all borders; no nested cards |
| Max two non-avatar radii | `Radius.lg` (12) for bubbles, `Radius.full` for chips/buttons |
| Max three type sizes per viewport | `Type.title`, `Type.body`, `Type.caption` in first viewport |
| Design tokens only | All spacing from `Space`, all radii from `Radius`, all type from `Type` |
| `useAppTheme()` for all colours | Every colour comes from `colors.*` |
| KeyboardAvoidingView | Wraps the conversation + input bar |

### State coverage (per AGENTS.md §14)

| State | Treatment |
|---|---|
| **Loading** | `TypingIndicator` in an assistant bubble while processing |
| **Populated** | FlashList of conversation messages |
| **Empty** | Greeting + suggested query chips |
| **Error** | Error message + retry button (re-sends last user query) |
| **Offline** | Offline banner; input disabled; send blocked |

### Accessibility

- `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` on every
  interactive element (chips, buttons, input, back)
- Chat messages use `accessibilityRole="text"`
- The greeting title uses `accessibilityRole="header"`
- The input uses `accessibilityRole="search"`
- 44pt minimum touch targets on all controls

### Browse hand-off

Tapping **View results** calls `resetBrowseFilters()` then
`updateBrowseFilters()` with the extracted brands, sizes, condition,
sustainableOnly, and a query string derived from the categories. It then
navigates to `Browse` with `categoryId: 'search'` so the Browse screen's
existing filter logic takes over.

---

## 5. Truthful Demo Mode

Per **AGENTS.md §11 (Truthful UI)**, the screen never claims to use GPT,
ChatGPT, or any LLM. Specifically:

1. **Demo mode banner** is always visible at the top of the screen:
   > "AI search is in demo mode — using keyword matching. Full AI coming soon."

2. **Extracted filters are labelled "Matched keywords"** — not "AI inference",
   not "understood intent", not "AI extracted".

3. **The service file** (`conversationalSearchApi.ts`) documents that
   `extractFilters` is "NOT AI" and is "deterministic keyword matching against
   small dictionaries."

4. **No fabricated success states:** the estimated match count is presented as
   "around X items" — an honest approximation, not a precise catalogue count.

5. **`CONVERSATIONAL_SEARCH_DEMO_MODE`** flag: when a real backend is wired,
   set this to `false` and replace the mock branches with real fetch calls.
   The UI layer does not need to change — the demo banner is driven by this
   flag.

---

## 6. Entry Point

**File:** `src/screens/GlobalSearchScreen.tsx`

An "Ask ThryftVerse" card is shown at the top of the discover landing (when the
search input is not focused and no query is entered). It navigates to
`ConversationalSearch`. The card uses a chatbubble icon, a two-line title
("Ask ThryftVerse" / "Describe it in your own words"), and a forward chevron.

---

## 7. Future Expansion

When a real conversational search backend is available:

1. **Set `CONVERSATIONAL_SEARCH_DEMO_MODE = false`** in
   `conversationalSearchApi.ts`.
2. **Replace the mock branches** in `startConversation` and
   `continueConversation` with real `fetch` calls to the backend.
3. **The UI does not change** — the demo banner disappears automatically, and
   the `isDemo` flags on returned entities become `false`.
4. **Real match counts:** replace `estimateMatchCount` with actual catalogue
   query counts from the backend.
5. **Semantic extraction:** a real LLM can infer implicit filters (e.g.
   "something for a winter wedding" → formal wear, dark colours) that keyword
   matching cannot.
6. **Streaming responses:** the contract supports adding a streaming mode
   where the assistant message content arrives incrementally.
7. **Conversation persistence:** persist sessions to the backend so users can
   resume a search conversation across app launches.
8. **Personalisation:** incorporate the user's wishlist affinities and browsing
   history into the retrieval step.
