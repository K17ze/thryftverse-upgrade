# W3-I Report — Chrome / Settings / Auth / Onboarding cluster

**Status:** done — all 10 tasks addressed (9 shipped, task 9 documented as a contract gap).
**Verify:** `npx tsc --noEmit` → 0 errors in W3-I files (34 pre-existing errors remain in `components/filters|search`, `feed-queries.ts`, `fixtures-seller.ts` — other workers' files, untouched). `npx eslint <all changed>` → clean.

---

## 1. Settings search (P1) — SHIPPED

- **`components/settings/settingsDestinations.ts`** (new) — 26-entry destination index mirroring mobile `settingsRouteMetadata.ts`: `{ id, label, section, icon, keywords, target }`. Every target is real — `route` push, `sheet` opener (language/verification/report/age), or `theme` toggle. `filterSettingsDestinations()` does the same triple-field substring match as mobile `useSettingsSearch` (label ∩ section ∩ keywords).
- **`components/settings/SettingsSearch.tsx`** (new) — the Instagram/mobile grammar: rounded search field (`bg-surface-alt`, search glyph, clear button, Esc clears, `aria-label`) pinned at the top of the index; while a query is active the sectioned hierarchy swaps for a flat `<ul>` of `SettingsRow` results (label + section subtitle). Honest empty state: `No settings match "…"`.
- **`components/settings/SettingsView.tsx`** — owns `settingsQuery` + `activateDestination`; results activate real behaviour (router push, index sheet, or live theme toggle for the on-page "Dark theme" row).

## 2. Badge semantics (P0) — SHIPPED

- **`components/layout/Header.tsx`** — `CountBadge` gains `tone: 'alert' | 'neutral'`. Danger red is now reserved for genuinely actionable counts (notifications, inbox unread); the bag badge wears the brand pill (`bg-brand text-text-inverse` — same grammar as the primary "Sell now" CTA). ARIA unchanged: counts already fold into `aria-label`, pill stays `aria-hidden`.
- MobileTabBar left alone: its only badge is inbox unread (a real alert — danger is correct) and there's no bag badge there.

## 3. Notification pre-disclosure (P1) — SHIPPED

- **`app/onboarding/OnboardingView.tsx`** — double-permission pattern: intro "Get started" now hands to a pre-ask step ("Stay in the loop") that names exactly what we send (order updates, price drops, auction alerts), says the categories are user-controlled in Settings, and states the browser will ask next. Only the explicit **"Enable notifications"** CTA fires `Notification.requestPermission()`; "Not now" exits honestly. Blocked/dismissed recovery states untouched.

## 4. Signup wall re-entry (P1) — SHIPPED

- **`components/auth/SignupWall.tsx`** — once-per-action-per-session stays (mobile parity), but a repeat tap on a walled action now answers with a quiet toast (`'Sign up to save items'` etc. per action) carrying a **Sign up** action → `/auth/signup`. Rate-limited 6s per action (`nudgedAt` map) so rapid taps can't stack pills. Toast is `info`-kind — restrained, not naggy; nothing fires on first dismissal.

## 5. Password policy unify (P1) — SHIPPED

- **`components/auth/passwordPolicy.ts`** (new) — `MIN_PASSWORD_LENGTH = 8` + one shared error string `Use at least 8 characters`. Verified against native: signup/reset already enforce 8 (`frontend/src/schemas/authSchemas.ts`, `ResetPasswordScreen.tsx`); the 6-char login bound was unreachable dead grammar.
- Wired into `LoginView.tsx`, `SignupView.tsx`, `ResetPasswordView.tsx` (local constant removed), and `SecurityView.tsx` change-password gate.

## 6. Sheet drag handle (P1) — SHIPPED (real implementation)

- **`components/ui/Sheet.tsx`** — the grab handle is now a real pointer-captured drag-to-dismiss: downward drag tracks the finger (`translateY`), scrim fades with travel, release ≥96px closes, under-threshold snaps back via a 180ms transform transition. `touch-none` on the handle so the gesture never fights content scroll; the drag starts only on the handle strip.
- **Structural fix required:** `sheet-enter` uses `animation-fill-mode: both`, which would pin `transform: translateY(0)` over any inline transform — entrance animation and positioning moved to a wrapper element, the dialog keeps focus-trap/aria/`dragY` transform.
- Esc dismiss, focus trap, focus restore, and the titled/ariaLabel dialog contract are unchanged; the handle stays `aria-hidden` (pointer-only gesture with keyboard/button equivalents — standard swipe-gesture pattern).

## 7. Session revoke / sign-out confirm (P1) — SHIPPED

- **`SecurityView.tsx`** — single-session revoke and "Sign out all other sessions" both route through `ConfirmSheet` (destructive variant, honest consequence copy: "loses access on its next request and need to log in again"). Post-confirm toast carries **Undo** — single revoke restores the row at its original index; bulk revoke re-merges in fixture order.
- **`SettingsView.tsx`** — "Sign out" now opens a `ConfirmSheet` ("Your bag, closet and messages stay on your account…") before calling `signOut()`. No Undo on sign-out itself (navigation-bound, Instagram parity — the undo window applies to revokes).

## 8. Personal info rows (P1) — SHIPPED

- **Plumbing:** `services/auth.ts` — `fetchMe()` now returns `{ user, account }` where `account: { email, emailVerified, phone }` reads the raw `/users/me` fields the public `User` contract drops (mobile `ProfileUser` parity). `SessionProvider` exposes `accountIdentity` + `refreshSession()`, cleared on sign-out/expiry. `services/users.ts` gains `updateMyProfile()` (`PATCH /users/me`, mirrors mobile `updateUserProfile`).
- **`components/settings/useAccountContact.ts`** (new) — one read path: live → session identity; fixture → demo contact record + persisted phone overlay (`thryftverse.web.account-contact`, same on-device honesty contract as the address/payment stores).
- **`components/settings/PersonalInfoView.tsx`** + **`app/settings/personal/page.tsx`** (new route) — Email row (display + Verified/Not verified, read-only like mobile — changes need re-verification), Phone row (masked `••• •• 45`, edit sheet → PATCH live / on-device overlay fixture, lenient intl validation, empty = remove), Date of birth row (honest: "confirmed during identity verification" → `/verification`). Guest → sign-in EmptyState; loading → skeletons. Fixture-mode footnote states edits are device-local.
- Hub row added under "Your account": **Personal info** → `/settings/personal`.

## 9. Passkeys / new-device alerts (P2) — GAP, NOT SHIPPED

No web contract exists: `services/auth.ts` has no passkey/WebAuthn endpoints and there is no web `accountSecurityApi` counterpart (mobile has one at `frontend/src/services/accountSecurityApi.ts` — sessions/incidents/recovery). The sessions list is already disclosed as fixture data. **No dead security rows were rendered** — this needs a backend/web-service port before a UI surface can be honest.

## 10. Mobile footer/legal — SHIPPED

- **`components/layout/Footer.tsx`** — footer now renders below md as a quiet legal strip: Help · Support · Buyer protection · Terms · Privacy · About (`nav aria-label="Legal and help"`, wrap row, `pb-28` clears the fixed tab bar). Desktop keeps the 4-column block (`hidden md:block` moved to the inner div).

---

## Files changed

| File | Change |
|---|---|
| `components/settings/settingsDestinations.ts` | new — search index |
| `components/settings/SettingsSearch.tsx` | new — field + flat results |
| `components/settings/SettingsView.tsx` | search wiring, Personal info row, sign-out ConfirmSheet |
| `components/settings/SecurityView.tsx` | revoke/revoke-all confirm + toast Undo, password constant |
| `components/settings/PersonalInfoView.tsx` | new — /settings/personal surface |
| `components/settings/useAccountContact.ts` | new — contact resolution + fixture overlay store |
| `app/settings/personal/page.tsx` | new route |
| `components/layout/Header.tsx` | CountBadge `tone`, bag → brand pill |
| `components/layout/Footer.tsx` | mobile legal strip |
| `components/ui/Sheet.tsx` | real drag-to-dismiss (+entrance wrapper split) |
| `components/auth/SignupWall.tsx` | re-entry nudge toast (rate-limited) |
| `components/auth/passwordPolicy.ts` | new — shared `MIN_PASSWORD_LENGTH=8` + error copy |
| `components/auth/LoginView.tsx` / `SignupView.tsx` / `ResetPasswordView.tsx` | unified policy |
| `app/onboarding/OnboardingView.tsx` | notification pre-ask step |
| `lib/api/services/auth.ts` | `fetchMe` returns account identity fields |
| `lib/api/services/users.ts` | `updateMyProfile` mutation (settings-scoped) |
| `lib/session/SessionProvider.tsx` | `accountIdentity` + `refreshSession` |

## Concerns / handoffs

- **Pre-existing TS failures elsewhere** (`filters/*`, `search/*`, `feed-queries.ts`, `fixtures-seller.ts`) — outside my ownership, presumably in-flight W3-E work; verify at merge.
- `fetchMe()` signature changed `User | null` → `{ user, account }` — sole caller is SessionProvider (verified by grep), but flag it if another branch added a caller.
- Fixture-mode personal info shows a demo contact (`member@thryftverse.app`) — consistent with every other fixture surface; the footnote discloses device-local persistence.
- The drag handle remains `aria-hidden` by design (pointer-only gesture; Esc/close button are the keyboard equivalents) — no eslint a11y rule flags it.
- Toast `show()` has no "already-visible" query; the nudge cooldown (6s > 3.2s toast life) is the anti-stack guard.
- Frequency cap (Vinted daily mail cap) and ⌘K palette remain un-implemented — noted as out-of-scope gaps in the dept report, not regressions.
