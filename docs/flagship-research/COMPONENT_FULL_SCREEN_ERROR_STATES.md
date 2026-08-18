# ThryftVerse Flagship Upgrade — Full-Screen Error States

**Component deep-dive:** full-screen error states for network failure, server error, permission denied, not found, offline mode, error recovery actions.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 §17 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
- Minimal error state: icon + headline + retry button
- "Couldn't load feed" / "Tap to retry"
- No error codes or technical jargon
- Offline banner at top: "No internet connection"
- Retry is one tap

### Linear (2026)
- Error state with context: "We couldn't load this issue"
- Retry button + "Copy error details" (for power users)
- Sentry-style error reporting (silent)
- Graceful degradation: show cached content if available

### Cross-cutting 2026 consensus
- Full-screen error: icon + headline + retry button
- No error codes in UI (log silently)
- Contextual message: "Couldn't load [X]"
- One-tap retry
- Offline banner (not full-screen): "No internet connection"
- Graceful degradation: show cached/partial content if available
- Tone: calm, not alarming
- No technical jargon

---

## 2. Psychology & Principles

### The error as a moment of trust
An error state is a moment of trust — the app failed, and the user is frustrated. A good error state acknowledges the failure calmly, explains what happened (in plain language), and provides a clear path forward (retry). A bad error state shows a stack trace, uses technical jargon, or provides no recovery action. The 2026 standard: calm, contextual, recoverable.

### No technical jargon
"Error 500: Internal Server Error" is a defect. "Something went wrong on our end. Tap to retry." is the 2026 standard. Error codes and stack traces are logged silently (Sentry, Crashlytics) but never shown to the user.

### Graceful degradation
If the network fails, show cached content if available. If a section fails, show the rest of the page. Only show a full-screen error if the entire screen has no content to display. Partial content + error banner is better than full-screen error.

### The retry as recovery
Every error state must have a retry button. One tap retries the failed operation. If retry fails again, show the same error state (not a different one). Consistency reduces confusion.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/EmptyState.tsx` | — | Generic empty state (may double as error) | ✅ Exists |
| `screens/CheckoutScreen.tsx` | 550+ | Has error handling | ✅ Exists |

### What exists
1. **EmptyState component** — may be reused for error states, but unclear if it has error-specific variants.
2. **CheckoutScreen** — has error handling (550+ lines).

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No shared FullScreenError component** — no reusable error state component | High |
| 2 | **No audit of all error states** — unknown how many screens handle errors properly | High |
| 3 | **No offline banner** — no "No internet connection" banner | High |
| 4 | **No graceful degradation** — unknown if screens show cached content on error | Medium |
| 5 | **No retry on all error states** — may not always have retry | Medium |
| 6 | **No contextual error messages** — may use generic "Error" | Medium |
| 7 | **No error logging** — unknown if errors are logged to Sentry/Crashlytics | Medium |
| 8 | **No partial content + error banner pattern** | Medium |

---

## 4. Micro Improvements

### M1 — Create shared FullScreenError component
```tsx
interface FullScreenErrorProps {
  icon: string;           // error icon
  title: string;          // "Couldn't load [X]"
  subtitle?: string;      // "Tap to retry" or "Check your connection"
  onRetry?: () => void;   // retry callback
  retryLabel?: string;    // default "Try again"
}
```
Full-screen error with icon, headline, optional subtext, retry button. Calm tone, no jargon.

### M2 — Create OfflineBanner component
Non-full-screen banner at top of screen: "No internet connection" with a small icon. Dismissible. Auto-shows when network status changes. Does not block interaction with cached content.

### M3 — Add contextual error variants
- **Network error**: "Couldn't load [X]" / "Check your connection and try again." / "Try again"
- **Server error**: "Something went wrong on our end." / "Tap to retry." / "Try again"
- **Not found**: "This [X] isn't available" / "It may have been removed." / "Go back"
- **Permission denied**: "Access needed" / "Enable [permission] to use this feature." / "Open settings"
- **Timeout**: "This is taking longer than expected" / "Tap to retry." / "Try again"

### M4 — Add graceful degradation
On error, check for cached content. If available, show cached content + error banner (not full-screen error). Only show full-screen error if no content is available.

### M5 — Add error logging
Log all errors to Sentry/Crashlytics silently. Include: error message, stack trace, screen name, user context. Never show error details to the user.

### M6 — Add retry on all error states
Every full-screen error has a "Try again" button. One tap retries. If retry fails, show same error state. Consistent.

---

## 5. Macro Improvements

### A1 — Error state system
- `FullScreenError` — shared component with contextual variants
- `OfflineBanner` — non-blocking offline indicator
- `ErrorBoundary` — React error boundary with fallback UI
- `useNetworkStatus` — hook for online/offline detection
- `useErrorHandler` — hook for consistent error handling + logging
- Per-surface presets: network, server, not found, permission, timeout

### A2 — Error handling patterns
- **Full-screen error**: only when no content is available
- **Partial content + banner**: when some content loaded but a section failed
- **Inline error**: when a specific action failed (e.g., "Couldn't save, try again")
- **Toast error**: for transient failures (e.g., "Couldn't like, try again")
- **Offline banner**: persistent, non-blocking, shows cached content

---

## 6. Flagship Acceptance Criteria

- **Shared FullScreenError** with contextual variants
- **OfflineBanner** — non-blocking, shows cached content
- **No technical jargon** — plain language only
- **Retry on all error states** — one-tap
- **Graceful degradation** — cached content + banner if available
- **Error logging** — silent Sentry/Crashlytics
- **Calm tone** — not alarming
- **Consistent retry** — same error state on retry failure
- **All states covered**: network, server, not found, permission, timeout

### Thumbnail test
At 25% scale, a full-screen error shows: a simple icon, a headline, and a retry button. Lots of whitespace. Calm, not alarming.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared FullScreenError | Low | All error surfaces |
| P0 | M2 — OfflineBanner | Low | Offline UX |
| P1 | M3 — Contextual variants | Low | All error types |
| P1 | M6 — Retry on all errors | Low | Recovery |
| P2 | M4 — Graceful degradation | Medium | Partial content |
| P2 | M5 — Error logging | Medium | Diagnostics |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `errorState.icon.size` | 48pt | Line icon |
| `errorState.icon.color` | colors.textMuted | Calm, not red |
| `errorState.title.font` | Type.subtitle | 16pt |
| `errorState.title.color` | colors.textPrimary | |
| `errorState.subtitle.font` | Type.body | 14pt |
| `errorState.subtitle.color` | colors.textMuted | |
| `errorState.retryButton.height` | 44pt | Control.touchable |
| `errorState.retryButton.variant` | 'outline' | Secondary |
| `errorState.retryLabel` | "Try again" | Default |
| `errorState.padding` | Space.xxl | Generous |
| `errorState.gap` | Space.lg | Between elements |
| `offlineBanner.height` | 44pt | Top of screen |
| `offlineBanner.background` | colors.warning | Amber |
| `offlineBanner.text` | colors.textPrimary | |
| `offlineBanner.font` | Type.caption | 12pt |
| `offlineBanner.icon` | 'cloud-offline' | |

---

*Generated 2026-08-18. Verified sources: reactnativerelay.com/article/react-native-error-handling-error-boundaries-global-handlers-sentry-crash-reporting-expo (RN 0.84/Expo SDK 55: Error Boundaries class components, ErrorUtils.setGlobalHandler, react-error-boundary library, section-level boundaries), github.com/getsentry/sentry-react-native PR #6023 (Sentry.GlobalErrorBoundary for non-rendering errors, includeNonFatalGlobalErrors, includeUnhandledRejections), auditbuffet.com/patterns/ab-001877 (offline banner pattern: @react-native-community/netinfo, accessibilityLiveRegion, "You are offline — changes will sync"), gummble.com/blog/empty-state-design-patterns (error states: calm + retry, Twitter/X "Something went wrong", Instagram "Couldn't refresh feed" top banner auto-retry keeping content visible). Production codebase audit: EmptyState, CheckoutScreen error handling. AGENTS.md §4 §17 state coverage.*
