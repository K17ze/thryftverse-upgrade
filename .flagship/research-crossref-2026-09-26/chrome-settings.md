# Cross-Reference Audit — Global Chrome, Settings, Auth, Onboarding, Invite, Agents, Policy

**Department:** global chrome (header, nav, footer, mobile tab bar, sheet/menu primitives) · settings cluster · auth flows · onboarding · invite · agents · static/policy pages
**Date:** 2026-09-26 · **Code:** `web/src` · **Mobile reference:** `frontend/src`
**Verdict:** The chrome/settings cluster is the most reference-literate surface in the app — hairline settings grammar, honest disclosure copy, real accessibility plumbing, APG-correct combobox/menus. The big missing piece is **settings search** (mobile ships it; Instagram/Vinted depend on it), plus a handful of destructive/confirmation and badge-semantics refinements.

---

## 1. Reference Grammar (live research distillation)

### Linear — settings as product education, keyboard-first
- Settings are a first-class surface with a "homepage" that teaches what the product can do; tooltips and tips live inside settings, not in a separate tour. (linear.app/now/settings-are-not-a-design-failure)
- Command palette (`⌘K`) groups commands by context and shows shortcuts beside every action — the palette is *how* power users learn the app.
- Chrome doctrine: "inverted-L" global chrome is deliberately quiet — hairlines, density, hierarchy over decoration.

### Airbnb — account hub clarity & trust grammar
- Account settings is a flat index of *named life-events* ("Personal info", "Login & security", "Privacy & sharing") — each row is a stable noun, not a feature pitch.
- Trust is surfaced as *status on rows* (verification state, device history, shared access) — the settings list itself communicates account health.
- Verification is described honestly: "doesn't guarantee that someone is who they say they are" — trust copy names its own limits.

### Vinted / eBay — notification & security depth
- Vinted: push and email managed as *separate channel screens*, each with a top-level "disable all" master plus per-category toggles and a **daily frequency cap** for non-priority mail. In-app notifications honestly non-disableable.
- eBay: "Sign in and security" groups password, **passkeys**, 2-step (SMS / authenticator app / app-approval), and new-device email alerts. Sessions/devices are reviewable; the account page is where compromised-state recovery begins.

### Instagram — settings search
- Settings/Accounts Center has a real **search box at the top of the settings index** that filters destinations — the escape hatch when IA gets deep. This is the single most-copied settings affordance of the last five years.

### Robinhood / Duolingo — onboarding pacing
- Robinhood: progressive disclosure — one question per screen, demo/explore path before commitment, disclosures behind links.
- Duolingo: defer signup until *after* first value (lesson), ~20% DAU lift; goal-setting questions create commitment; permission asks ride *after* an earned moment.

### Stripe — form UX
- Validate as-you-type but never mid-keystroke; errors are **specific, field-adjacent, and tell you the fix** ("Card number is incomplete", not "Invalid input"); preserve input on failure; focus the first invalid field.

### Permission honesty (web.dev / Android)
- Never fire a permission prompt without user context; the double-permission pattern (custom explainer → real prompt) avoids the permanent-blocked state; on `denied`, the only honest path is directing to browser/OS settings.

---

## 2. Our Implementation

### Global chrome
- **AppShell** (`components/layout/AppShell.tsx:11-60`) — chromeless prefixes for `/auth`,`/onboarding`; immersive detail regex hides tab bar on pushed screens; first-visit onboarding gate is hydration-gated (`:28-46`) so SSR never flashes the shell.
- **Header** (`components/layout/Header.tsx`) — sticky flat bar; desktop combobox search (`:167-218`) with full APG wiring (`role=combobox`, `aria-activedescendant`, ArrowUp/Down wrap, Escape close, outside-pointer close, route-change close); utility IconButtons carry badges with counts folded into `aria-label` (`:233-254`); guest→`Sign in`, member→AccountMenu; `Sell now` CTA gated by `requireAuth('create_listing')`.
- **SearchSuggestions** (`components/layout/SearchSuggestions.tsx`) — sections: "search for" → items (thumb+price) → members (avatar+verified+followers) → recent (removable) → trending → brand chips; pinned "Search by photo" link deliberately *outside* the listbox since it navigates (`:336-350`).
- **DepartmentNav** (`components/layout/DepartmentNav.tsx`) — hover/focus flyouts with invisible bridge, `aria-expanded`/`aria-controls`, ArrowDown enters panel, Escape returns focus to trigger with focus-suppress so it doesn't instantly reopen (`:225-235`).
- **AccountMenu** (`components/layout/AccountMenu.tsx`) — `role=menu`, identity header, 11 destinations, sign-out; Escape/arrow-key roving, outside-close, first-item focus on open.
- **MobileTabBar** (`components/layout/MobileTabBar.tsx`) — 5-slot port of `TabNavigator`: Home/Explore, center Create action button (52px target, 40px pill), Inbox with unread badge (requests counted separately — matches mobile grammar `:35-39`), Profile avatar w/ active ring, guest→Sign in.
- **Footer** (`components/layout/Footer.tsx`) — 4-column link block, desktop-only (`hidden md:block`).

### Primitives
- **Sheet** (`components/ui/Sheet.tsx`) — portal, scrim-click close, focus trap with wrap-around, focus restore on unmount, scroll lock, Escape; bottom-sheet ≤sm / centered dialog ≥sm; named via `title` or `ariaLabel`. Missing: drag-to-dismiss gesture on mobile.
- **Chip / IconButton / Switch / SegmentedControl** — one grammar each: Chip h-9 with ::after hit-stretch to 44px + `aria-pressed`; IconButton 44px transparent target w/ `onMedia` scrim variant; Switch `role=switch` 44px hit on 28px track; SegmentedControl (`components/feed/SegmentedControl.tsx`) correctly opts *out* of tablist semantics (aria-pressed buttons, no roving tabindex).
- **EmptyState** — flat glyph + title + one action, `role=status`. **Toast** — bottom pill, success/info/error, one trailing action (Undo-able), `role=alert` for errors.

### Settings cluster
- Hub (`components/settings/SettingsView.tsx`) — identity row + Thryft balance, grouped hairline sections: Your account / Buying & selling / Notifications / Experience / Connected services / Help & legal, destructive zone separated at bottom. Theme toggle writes `localStorage` + `dataset.theme` (`:51-56`). **No search input — see gap table.**
- **Pre-paint restore — VERIFIED PRESENT:** `app/layout.tsx:47-50` inline script resolves theme, text-size zoom, and reduce-motion/high-contrast classes from `localStorage` before first paint; `AccessibilityPrefs.tsx` re-applies post-hydration and SSRs the companion CSS block (`:32-68`). `html.reduce-motion` squashes all animation/transition; `html.high-contrast` re-tokens muted/border vars for both themes.
- **AccessibilityView** — 4-stop text-size radiogroup (real zoom, honest "device settings still apply" copy), reduce-motion, high-contrast.
- **NotificationPrefsView** — push×email matrix per category, locked security alerts, pause/resume master that snapshots the mix (`settingsPrefs.ts:191-207`), quiet hours.
- **PrivacyView** — visibility switches + block/restrict member lookup with consequence copy ("Can't message you… they aren't told").
- **SecurityView** — change-password w/ strength, **fixture sessions list w/ revoke + "sign out all others"**, 2FA switch → **honest demo sheet** (says no real handshake exists).
- **DataView** — consent toggles, real JSON export of persisted stores, **typed-`DELETE` confirmation** that clears all `thryftverse.*` keys; deliberately suppressed a `recommendations` toggle whose effect no surface consumes (`:35-37`) — exemplary honesty.
- Sheets (`SettingsSheets.tsx`, `AgeConfirmationSheet.tsx`) — language picker with disabled unavailable locales + "English-only for now" note; verification reads real session tier; age-18 self-declaration with denied-state and reset.

### Auth
- **AuthShell** — editorial collage + trust points (buyer protection / verified sellers / secure payments); guest-only, signed-in redirect.
- **AuthLanding** — sign-up/log-in tab rail, email-continue → prefilled signup, social buttons with *explicit demo disclosure*; in live mode social is plainly labelled unavailable rather than dead.
- **LoginView / SignupView / Forgot / Reset** — field-level errors with `aria-invalid`/`aria-describedby`/`role=alert`, show/hide password, live `PasswordStrength` (4-requirement checklist, `aria-live`), forgot→sent state with resend + anti-enumeration copy, reset handles missing/expired token dead-ends with recovery CTA.
- **SignupWall** — one value sentence per gated action, Create account / Log in / **Maybe later**; once-per-action-per-session module Set (`:72,141-145`).

### Onboarding / Invite / Agents / Policy
- **OnboardingView** — single screen: value headline → "Get started" fires `Notification.requestPermission()`; honest `dismissed` vs `blocked` states — blocked copy directs to browser site settings with "check again" re-poll (`:53-78`); Skip always present.
- **InviteView** — deterministic code, clipboard+`navigator.share`, honest "rewards aren't live yet" everywhere, real empty states, tier only when earned.
- **Agents** — hub (installed toggles + directory + oversight links), ledger, builder, algorithm; loading/error/empty covered.
- **Policy** — `/help` (searchable real-copy FAQ), `/privacy`, `/terms`, `/about`, `/buyer-protection`, `/sustainability`, `/verification` (staged KYC), `/appeal` — all exist with last-updated stamps and plain-language copy.

---

## 3. Gap Table

| Capability | Reference | Status | Evidence |
|---|---|---|---|
| Settings grouped hairline IA | Vinted/Linear | **MATCHED** | `SettingsSection.tsx`, `SettingsView.tsx:104-213` |
| Settings search | Instagram / mobile `SettingsSearchResults.tsx` | **MISSING** | no input in `SettingsView.tsx`; mobile has `components/settings/SettingsSearchResults.tsx` + `settingsRouteMetadata.ts` |
| Accessibility: text size / contrast / motion, pre-paint | Apple/Linear | **MATCHED** | `layout.tsx:47-50`, `AccessibilityPrefs.tsx:79-91`, `AccessibilityView.tsx` |
| Notification matrix + master pause/resume | Vinted | **MATCHED+** | `NotificationPrefsView.tsx`, `settingsPrefs.ts:191-207` (matrix exceeds Vinted's split screens) |
| Daily notification frequency cap | Vinted | **MISSING** | — |
| Sessions/devices management | eBay/Airbnb | **PARTIAL** | `SecurityView.tsx:133-185` — fixture list, instant revoke, no confirmation/Undo |
| Passkeys / new-device email alerts | eBay | **MISSING** | — |
| 2FA grammar | eBay | **PARTIAL** | `SecurityView.tsx:189-271` — honest demo sheet; no QR/code step (disclosed) |
| Personal info (email/phone change) | Airbnb | **MISSING** | hub has Security + Edit profile but no email/phone row |
| Auth trust proof | Airbnb | **MATCHED** | `AuthShell.tsx:31-35` |
| Field-adjacent specific errors | Stripe | **MATCHED** | `AuthField.tsx:29-45`; caveat: login min-length 6 vs signup 8 (`LoginView.tsx:40` vs `SignupView.tsx:47`) |
| Guest browsing + soft signup wall | Duolingo | **MATCHED** | `SignupWall.tsx`; caveat: silently dead on re-tap (`:142-145`) |
| Onboarding skip/exit honesty | Robinhood | **MATCHED** | `OnboardingView.tsx:144-146` Skip; blocked/dismissed states |
| Notification ask in context / double-permission | web.dev | **PARTIAL** | prompt fires behind a tap (`:57`) but the CTA says "Get started" — no pre-disclosure that it asks for notifications; ask precedes any delivered value (first-launch) |
| Combobox search ARIA | APG | **MATCHED** | `Header.tsx:190-199`, suggestions listbox groups |
| Keyboard-first / ⌘K | Linear | **MISSING (acceptable)** | no global shortcuts or palette anywhere in `web/src` |
| Destructive typed confirmation | GitHub/Stripe-grade | **MATCHED** (delete) | `DataView.tsx:100-192` |
| Destructive confirm — sign out / session revoke | Instagram/Airbnb | **PARTIAL** | instant + toast, no Undo; `SettingsView.tsx:58-62`, `SecurityView.tsx:138-141` |
| Footer policy cluster | — | **PARTIAL** | desktop only (`Footer.tsx:51`); mobile reaches legal via settings → Help & legal |
| Badge semantics | Vinted | **PARTIAL** | counts folded into `aria-label` (good) but **bag/inbox/notif all use `bg-danger`** (`Header.tsx:39`) — a cart count is not an alert |
| Empty/destructive state grammar | — | **MATCHED** | `EmptyState.tsx`, `DataView` delete flow |
| Policy pages real copy | — | **MATCHED** | `/privacy`,`/terms`,`/about`,`/help` (searchable), `/appeal`,`/verification` |
| Language/i18n | Vinted | **PARTIAL** | honest disabled options; no i18n layer (disclosed) |

---

## 4. Top Caveats

1. **Settings search is missing on web while mobile ships it.** `frontend/src/components/settings/SettingsSearchResults.tsx` + `hooks/settings/settingsRouteMetadata.ts` filter destinations by query; Instagram's settings search is the industry grammar. `SettingsView.tsx` needs a search field + a flat-results mode. **Highest-value gap in the department.**
2. **Badge color semantics.** `CountBadge` (`Header.tsx:35-45`) renders `bg-danger` for *all* counts — bag, inbox, notifications alike. Danger-red on a bag icon reads as an error state; Vinted/eBay use accent/neutral for cart. ARIA side is fine (counts in `aria-label`, pill `aria-hidden`).
3. **Onboarding's "Get started" silently triggers the browser permission prompt** (`OnboardingView.tsx:45-63`). The tap satisfies user-activation, but nothing tells the user *what* they'll be asked — the double-permission pattern wants an explicit "Enable notifications" CTA before the OS prompt. The ask also precedes all value delivery; Duolingo deferral would place it post-first-action. The blocked/dismissed recovery states, however, are best-in-class.
4. **SignupWall goes silently dead after first dismissal** (`SignupWall.tsx:141-145`): once an action is walled once, repeat taps do nothing — no toast, no wall. Honest non-nagging, but a dead control is a dead end; a minimal "Sign in to save items" toast would preserve intent.
5. **Session revoke / sign-out have no confirm or Undo.** `SecurityView.tsx:138-141` removes a session instantly with an info toast; the Toast primitive already supports an `action` slot — wire `Undo`. Sign-out (`SettingsView.tsx:58-62`) is acceptable as instant (Instagram parity) but worth a note.
6. **Password policy inconsistency:** login validates `≥6` (`LoginView.tsx:40`) while signup/reset require `≥8` (`SignupView.tsx:47`, `ResetPasswordView.tsx:27`). Cosmetic — no 6-char password can exist — but sloppy grammar a Stripe reviewer would flag.
7. **No email/phone management** in settings (Airbnb's "Personal info" pillar). `Edit profile` covers the public surface; account-credentials rows are absent.
8. **Notification frequency cap absent** — Vinted's daily-cap for non-priority mail has no counterpart; quiet hours partially covers it.
9. **Sheet lacks drag-to-dismiss** on touch — the grab handle is visual only (`Sheet.tsx:78-80`). Acceptable on web, noted for native-parity.
10. **Pre-paint accessibility restore verified working** — theme + textSize zoom + reduce-motion/high-contrast classes are applied from `localStorage` in `layout.tsx:47-50` before first paint, then re-owned by `AccessibilityPrefs` post-hydration. Uses `zoom` (now cross-browser since FF126). No gap found here — the recent work landed correctly.
