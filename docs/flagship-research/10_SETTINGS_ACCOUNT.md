# 10 — Settings, Account, Security, Privacy & Verification: Flagship Research Report

**Department:** Settings, account, security, privacy, data, accessibility, KYC, verification, two-factor, blocked users, active sessions, connected accounts, data export, delete account
**Date:** August 2026
**Scope:** SettingsScreen root → account/security/privacy/data sub-screens → KYC/verification → 2FA → sessions → blocked users → connected accounts → data export → delete account → accessibility
**Charter references:** AGENTS.md §3 (case study), §4 (push to maximum quality), §11 (truthful UI), §12 (navigation quality), §13 (control quality), §14 (state completeness), §27 (2026 flagship UX psychology)

---

## 1. 2026 Competitor Benchmark — iOS/Android System Settings & Instagram/Snapchat

Settings is the surface where polish shows. It is mostly grouped lists and toggles, which makes it easy to build and easy to get subtly wrong: inconsistent spacing, options buried in the wrong place, destructive actions sitting next to harmless ones. The 2026 benchmark is not visual novelty — it is **convention mastery**. The convention is the entire job.

### iOS Settings — the gold standard for grouped lists

Apple's 2026 iOS Settings app remains the reference every mobile designer is judged against. The pattern is disciplined:

- **Grouped lists with section headers.** Related options sit under a single header (`Notifications`, `General`, `Display & Brightness`). The header is a small uppercase muted label — not a card, not a banner. Sections are separated by vertical breathing room, not borders.
- **One idea per row.** Each row carries a title, an optional subtitle, an optional value on the right, and a chevron if it drills deeper. Toggles sit flush right. The row does not try to do two things.
- **System-native grouped list style.** Rows share a single contiguous surface — a rounded-rect group — with hairline separators *between* rows and *no* separator on the first/last row. The group is the container; the rows are not individually wrapped.
- **Destructive actions placed last and styled distinctly.** "Sign Out", "Delete Account", "Erase All Content" sit at the bottom of their section, in red, separated from harmless rows by either a section break or a visual demotion. They are never adjacent to a benign toggle.
- **Dynamic Type and dark mode parity.** Geometry, hierarchy and density are identical across themes. Dark mode is not permission to add translucency or glow.

### Android Material 3 settings — overview + subscreens

Android's 2026 Material 3 settings guidance (developer.android.com/design/ui/mobile/guides/patterns/settings) is explicit and converges with iOS:

- **Provide an overview.** Users should quickly see the most important and frequently used settings and their values. Create an overview page using a list layout. Prioritise the settings users find most important; group the rest onto separate screens.
- **For 15+ settings, group related settings under a subscreen.** The label of the setting that opens a group must match the subscreen title — consistent terminology.
- **Group settings in smaller relevant groups.** Use visual or intrinsic containment and headings between groups instead of individual items. Dividers cluster settings *in* a group, rather than separating individual settings.
- **Add search for complex hierarchies.** For deep settings trees, add search so users can find the correct preference.
- **Respect system settings.** Your app may not need its own settings — push task-specific controls into the screens they affect, not a global settings menu.

### Instagram — identity-led, grouped, destructive-last

Instagram's 2026 settings (iOS, captured February 2026) is the consumer-app reference:

- **Profile photo + username + "Edit Profile" link at the top** — a tappable identity row, not a card. The user sees *who they are* before *what they can change*.
- **Grouped sections with clear headers** — Account, Privacy, Security, Notifications, Help. Each section is a contiguous grouped list, not a stack of separate cards.
- **"Delete Account" at the very bottom** of a long settings list, in red, with a multi-step confirmation flow. It is never adjacent to a benign row.
- **Search at the top** for settings discovery — a single field that filters in place.

### Snapchat — sectioned list, blocked users surfaced

Snapchat's 2026 settings (Page Flows capture, 23 screens) follows the same skeleton: Account → Settings → Notifications → Memories → Permissions → Blocked users → Preferences. Blocked users is a first-class row, not buried two levels deep. Permissions links out to system settings truthfully (the app cannot revoke OS permissions, so it routes the user to the place that can).

### The 2026 consensus — danger zone separation

The 2026 industry consensus (setting.page, uxpatterns.dev, gummble.com) is sharp on one point: **routine preferences above, dangerous actions below, with stronger visual framing and clearer consequence copy.** GitHub's "Danger Zone" (red section header, explicit confirmation per action), Notion's "type the workspace name" pattern, and Instagram's bottom-placed red "Delete Account" all follow the same principle: the destructive action is *separated* by section, *demoted* by position, and *confirmed* by typed input. The phrase "danger zone" gives teams a simple mental model — it signals that the controls inside are different from everyday preferences.

The 2026 App Store Guideline 5.1.1(v) enforcement (still active in 2026 per PTKD Journal) adds a hard constraint: account deletion must be initiated from within the app, must be easy to find (typically one or two taps from main account settings), must remove the account record and personal data (deactivation alone is insufficient), and must use the verbatim label "Delete Account" — not "Manage", "Close", or "Cancel". Apps using Sign in with Apple must revoke the auth token via Apple's REST API as part of the flow.

---

## 2. Psychology & Principles

### 2.1 Control & safety — the mental model of "my account"

Settings is the one surface where the user expects *sovereignty*. Every other surface in the app is the product talking to the user; settings is the user talking back to the product. The 2026 privacy-settings UX pattern (uxpatternsguide.com) is explicit: "Privacy controls are important enough to require a dedicated account, product, dashboard, or device privacy surface." The user's mental model is "this is *my* account, *my* data, *my* choices" — and the surface must reinforce that model by showing current effective values, scope, source of truth, and last-updated times. When the user cannot see the current state of a control, the surface becomes untrustworthy.

For ThryftVerse, this means every toggle must reflect real persisted state, every navigation row must show its current value (e.g. "2FA enabled", "3 blocked", "Google linked"), and every destructive action must make its scope visible *before* the user commits.

### 2.2 Destructive action gravity

The danger-zone research (setting.page/danger-zone-ux-for-settings) is unambiguous: "In a normal settings UI, speed and convenience are often the priority. In destructive settings design, clarity, intent, and recoverability should take the lead." The user needs to know *what the action touches* — scope is often more important than the action label itself. "Delete account" is not enough; the user must see what disappears (username, email, payment methods, wallet history, active orders), who is affected (buyers with open orders, pending payouts), and whether external systems are involved (Sign in with Apple token revocation).

The principle: **destructive actions are not another row — they are a different category of interaction.** They get their own section, their own visual framing, their own confirmation ritual (typed phrase, password, biometric gate), and their own honest consequence list.

### 2.3 Progressive disclosure of sensitive settings

The 2026 mobile settings research (setting.page/mobile-settings-page-design-patterns) introduces a frequency/risk/complexity matrix:

- **High frequency + low risk + low complexity** → top-level row or quick toggle.
- **Medium frequency + medium complexity** → grouped subpage.
- **Low frequency + high risk** → own detail screen with explanatory text and confirmation.

Account deletion, 2FA disable, data export, and KYC resubmission are all low-frequency/high-risk — they belong on dedicated screens with progressive disclosure: a restrained entry row → a consequence/information screen → a confirmation screen → a typed-phrase + password final gate. ThryftVerse's `DeleteAccountScreen` and `AccountControlScreen` already follow this pattern; the gap is in the *entry rows* on the settings root, where destructive and benign rows share the same visual treatment.

### 2.4 Trust through transparency

The 2026 privacy settings research (setting.page/privacy-settings-page-examples) identifies six dimensions of trustworthy privacy UX: clarity of scope, clarity of consequence, reversibility, granularity, trust signals, and implementation integrity. "Implementation integrity — does the UI map cleanly to backend state, logs, permissions, and compliance requirements?" is the dimension most settings surfaces fail. A toggle that says "Analytics opt-out" but only persists to local AsyncStorage is a trust failure waiting to be discovered.

The principle for ThryftVerse: **every privacy control must either persist to the backend or honestly disclose that it is device-local.** The current `DataPrivacyScreen` does this with a `DATA_PRIVACY_DEMO_MODE` banner — that is truthful. But the `PrivacySettingsScreen` "Privacy posture" score is computed from a mix of local-only state (`activityStatusVisible`, `searchVisibility`) and store state (`accountPreferences.privateProfile`, `twoFactorEnabled`) without disclosing which is which. The score presents as authoritative when parts of it are local optimistic state.

### 2.5 Verification is a trust moment, not a form

The 2026 KYC research (FinAuth-SDK/digital-onboarding-best-practices, identomat.com, cleverx.com) converges on five principles:

1. **Verify at the moment of value, not at signup.** Gate the action that needs identity (listing, payout, co-own), never the front door.
2. **Meet the camera where it is.** The phone is the best capture device — design the hand-off, don't redirect to a browser unless the provider requires it.
3. **Make pending a first-class state.** Most flows fail on what happens *after* submission, not during capture. "In review" must be a designed state with ETA, timeline, and resubmit path.
4. **Match friction to risk.** Passive checks for everyone; step-up only where signals warrant.
5. **Say what you do with the data.** Verification asks for trust; visible privacy practice earns it back.

The 2026 CHI research on GenAI privacy choice (dl.acm.org/doi/10.1145/3772318.3790809) reinforces: users exhibit "paradoxical patterns" — they sometimes trusted third-party ecosystems more for personalization but perceived greater control in first-party ecosystems when data was shared externally. For ThryftVerse KYC, the user is handing a government document to a fashion marketplace. The privacy reassurance must be visible *before* the camera, not after.

### 2.6 The 2FA adoption paradox

The 2026 USENIX research (saasframe.io/blog/the-2fa-ux-paradox) is a landmark: simple UX adjustments increased 2FA click-to-enable rates by 26-33% with zero backend change. The winning interventions:

- **Interstitial prompts** (blocking, not passive reminders) increased adoption by 22.1%.
- **Mechanism explanation in the CTA** — "Turn on two-factor authentication and we'll ask for a code if we see a login from a device we don't recognize" — increased adoption by 28% over generic "added security" messaging. The key is answering the unspoken question: "Will this make my life difficult?"
- **Recovery codes as a first-class step** — not an afterthought. The user must leave setup with the codes saved, or the setup is incomplete.

ThryftVerse's `TwoFactorSetupScreen` already follows the QR → verify → recovery-code flow. The gap is in the *entry*: `ChangePasswordScreen` shows a "2FA not enabled" warning with a "Set up 2FA" link, but the framing is generic ("Add an extra layer of security") — the 2026 research says this exact phrasing underperforms.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The settings department is the most screen-rich area of the app: 16 screens + 11 settings components + 1 security component. The architecture is broadly sound — `SettingsScreen` is a grouped-list root with inline search, `SettingsSection`/`SettingsRow` are reusable primitives, and the destructive flows (`DeleteAccountScreen`, `AccountControlScreen`) use progressive disclosure with typed-phrase + password + biometric gates. But the flagship bar (AGENTS.md §4) is not met. The defects below are concrete and code-referenced.

### 3.1 Card-on-card composition in privacy/data/connected-accounts screens

AGENTS.md §4: "No card-on-card composition. A nested surface requires a distinct interaction or state boundary. Otherwise flatten it."

- `PrivacySettingsScreen.tsx:77-94` — a `heroCard` (rounded, bordered, `colors.surface`) wraps the "Privacy posture" hero. Below it, `SettingsSection` with `noCard` renders flat rows. The hero card is a single-purpose panel — acceptable. But at `:171-199` a `safetyTipsCard` (rounded, bordered, `colors.surface`) wraps three safety tips, each with its own checkmark icon — this is a card containing a list of items that could be flat rows. The card exists for visual weight, not for a distinct interaction boundary.
- `DataPrivacyScreen.tsx:104-131` — `heroCard` wraps "Your data" + a 6-item `dataList` where each item has its own `dataIcon` (a rounded square `colors.surfaceAlt` background). That is a card containing mini-cards. The data categories could be flat rows with leading icons, matching the `SettingsRow` primitive used elsewhere on the same screen.
- `ConnectedAccountsScreen.tsx:175-216` — each connected account is an `accountCard` (rounded, bordered, `colors.surface`) containing a `providerIcon` (rounded-full, `meta.color + '18'` tint) + text + an Unlink button. With 2 accounts, the screen shows 2 cards stacked — acceptable. But the `heroCard` at `:136-150` plus the `securityNote` card at `:220-230` plus the account cards means the first viewport has 3 distinct rounded surfaces. The thumbnail test (§4) would flag repeated rounded rectangles dominating the silhouette.
- `AccessibilitySettingsScreen.tsx:150-164` — `heroCard` (rounded-xl, bordered) wraps the accessibility hero. Then each toggle row at `:382-391` is *also* a `toggleRow` with `backgroundColor: colors.surface`, `borderRadius: Radius.lg`, `borderWidth: hairlineWidth`. That is 5 individually-carded toggle rows on one screen — the opposite of a grouped list. iOS would put all 5 toggles in one contiguous grouped list with hairline separators between.

### 3.2 Dead/redirect screen — AccountSettingsScreen

`AccountSettingsScreen.tsx:14-34` is a redirect stub. It renders a `FlagshipScreen` with title "Private details", subtitle "Redirecting…", and an empty `<View />`, then calls `navigation.replace('EditProfile', {})` in a `useEffect`. This is a dead screen — it exists only because old navigation entrypoints reference it. AGENTS.md §12: "no duplicate screens". The redirect is honest (it tells the user it is redirecting), but the screen should be removed from the navigator and the entrypoints updated to navigate directly to `EditProfile`.

### 3.3 Fabricated/optimistic privacy posture score

`PrivacySettingsScreen.tsx:33-41` computes a "Privacy posture" score from four items:

```ts
const postureItems = [
  { label: 'Private profile', active: accountPreferences.privateProfile },
  { label: '2FA enabled', active: twoFactorEnabled },
  { label: 'Activity status hidden', active: !activityStatusVisible },
  { label: 'Search hidden', active: searchVisibility === 'hidden' },
];
```

`activityStatusVisible` and `searchVisibility` are local `useState` initialised to `true` and `'visible'` respectively (`:29-30`). They are not hydrated from the backend on mount — the toggle handlers call `updateActivityStatus`/`updateSearchVisibility` on toggle, but the *initial* state is a guess. So the posture score on first render always shows "Basic" or "Open" regardless of the user's actual server-side privacy settings. This is a §11 truthful-UI violation: the score presents as authoritative when two of its four inputs are fabricated defaults. The fix is to hydrate these values from the backend (or from `accountPreferences`) on mount, and to show a loading skeleton for the posture hero until hydration completes.

### 3.4 DataPrivacyScreen demo-mode banner is dev-only

`DataPrivacyScreen.tsx:43` — `const DATA_PRIVACY_DEMO_MODE = __DEV__;`. The demo banner ("Privacy controls are saved on this device only in demo mode") only appears in dev builds. In production, the `personalizedAds`, `recommendationPersonalization`, and `thirdPartySharing` toggles (`:62-64`) are local `useState` with no persistence — they reset on unmount. The user toggles "Personalised ads" off, navigates away, comes back, and the toggle is on again. This is a silent §11 violation in production: the control appears to work but does nothing persistent. Either persist these to the backend (preferred) or to AsyncStorage with an honest "saved on this device" disclosure that ships in production, not just dev.

### 3.5 Weak destructive separation on SettingsScreen root

`SettingsScreen.tsx:423-429` — the "Delete account" row uses `danger` prop (red text) but sits *inside* the "Your account" `SettingsSection`, directly below "Download my data" (`:417-422`) and above "Privacy & safety" (`:430-435`). The 2026 benchmark is explicit: destructive actions belong at the *bottom* of the settings list, separated from benign rows by a section break. ThryftVerse's "Delete account" is in the middle of the account section, one row away from a benign export row. The `SettingsSignOutRow` at `:700-702` is correctly separated (it sits below all sections with `marginTop: Space.lg`), but the delete row is not.

There is also a structural redundancy: `AccountControlScreen` (`:411-416`, subtitle "Security, sessions, password") and `DeleteAccountScreen` (`:423-429`) both cover destructive account actions, and `AccountControlScreen` itself contains a "Delete account permanently" option (`AccountControlScreen.tsx:152-179`). So the user can reach deletion via two paths: Settings → Delete account, or Settings → Account control → Delete account permanently. This is not a duplicate screen (the two flows differ — `DeleteAccountScreen` requires password + biometric; `AccountControlScreen` requires only typed DELETE), but the entry-point duplication is confusing.

### 3.6 Missing system-native grouped list style

The `SettingsSection` component (`SettingsSection.tsx:45-49`) supports `noCard` (flat) vs card (rounded, bordered). The `SettingsScreen` root uses `noCard` throughout — good. But the rows inside do not get the iOS-grouped-list treatment: there is no contiguous rounded-rect group wrapping each section's rows. Instead, each section is a flat list with hairline separators between rows (`SettingsRow.tsx:75`). This is closer to Android Material than to iOS grouped. For a fashion marketplace that wants to feel premium, the iOS grouped style (one rounded container per section, rows inside with hairline separators, no separator on first/last) would elevate the perceived quality without adding decoration.

The `SettingsCard` component (`SettingsCard.tsx`) exists and supports `surface`/`elevated`/`tint`/`glass` variants — but it is not used by `SettingsScreen`. The `glass` variant uses `Glass.bg`/`Glass.border` — AGENTS.md §4 prohibits glass effects. This component is a relic of an earlier design system and should be either removed or refactored to drop the `glass` variant.

### 3.7 Verification status — local `kycVerified` flag can fabricate "Verified"

`VerificationScreen.tsx:130` — `const effectiveKycVerified = kycVerifiedLocal || kycBackendVerified;`. `kycVerifiedLocal` is `coOwnCompliance.kycVerified` from the store. This flag is set to `false` on submission (`:178`: `updateCoOwnCompliance({ kycVerified: false })`) — correct. But there is no path that sets it to `true` from the frontend; it can only become `true` via backend sync. However, if the backend `fetchKycStatus` call fails (network error, caught at `:117`), the local flag is the only source of truth — and if a previous version of the app or a different flow ever set it to `true` optimistically, the user would see "Verified" with no backend confirmation. The code is *currently* truthful (local is only ever set to `false`), but the architecture is fragile: the `||` merge means any stale local `true` overrides a backend `pending`/`rejected`. The safe fix is `effectiveKycVerified = kycBackendVerified` (backend is the only source of truth for verified status) and to use `kycVerifiedLocal` only as a fallback for *pending* display when the backend is unreachable.

### 3.8 Two parallel KYC screens — KYCVerificationScreen vs VerificationScreen

`KYCVerificationScreen.tsx` and `VerificationScreen.tsx` both implement a KYC submission flow. `KYCVerificationScreen` is a 5-step wizard (Identity → Document → Selfie → Business → Review). `VerificationScreen` is a status + inline KYC + DAC7 flow. Both call `createKycSession` and `fetchKycStatus`. The navigator registers both (`AppNavigator.tsx` — `KYCVerification` and `Verification`). This is near-duplicate screens serving overlapping purposes. AGENTS.md §7: "Do not create ScreenV2.tsx as a replacement for existing production screens." The canonical path should be consolidated: `VerificationScreen` (status + entry) → `KYCVerificationScreen` (the 5-step wizard) → `VerificationStatusScreen` (timeline). Currently `VerificationScreen` *also* contains its own inline KYC form (`:379-493`), making it both a status screen and a KYC form — two responsibilities in one screen.

### 3.9 AccessibilitySettingsScreen — individually-carded toggle rows

`AccessibilitySettingsScreen.tsx:382-391` — each toggle row is its own `toggleRow` with `backgroundColor: colors.surface`, `borderRadius: Radius.lg`, `borderWidth: hairlineWidth`. With 4 toggles (1 motion + 2 display + 1 screen reader), the screen shows 4 separate cards stacked vertically. This violates the grouped-list convention — iOS would group these into 3 contiguous sections (Motion, Display, Screen reader) with hairline separators between rows and one rounded container per section. The current composition is card-on-card: each toggle is a card, and they are stacked on a flat canvas. The thumbnail test would flag 4 repeated rounded rectangles.

### 3.10 ActiveSessionsScreen — fabricated fallback "current" session

`ActiveSessionsScreen.tsx:201-213` — when `currentSessions.length === 0` (no current session returned by the API), the screen fabricates a fallback row: `{Platform.OS === 'ios' ? 'iPhone' : 'Android device'}` with "Active now". This is a §11 violation: the screen is showing a fabricated session when the API returned no current session. The honest behaviour is either to show a loading state (if the API is still loading) or an empty state ("Could not identify this device's session") — not to invent a device name.

### 3.11 Hero cards on every screen — surface budget violation

AGENTS.md §4: "Surface budget. Above the fold, use at most one dominant non-media panel." The settings department systematically violates this:

- `PrivacySettingsScreen` — hero card + safety tips card = 2 dominant panels above the fold.
- `DataPrivacyScreen` — hero card (with 6-item data list inside) = 1 dominant panel, but it is very large.
- `DataExportScreen` — hero card + category card = 2 dominant panels.
- `DeleteAccountScreen` — warning hero + consequence card = 2 dominant panels.
- `ConnectedAccountsScreen` — hero card + (empty state card OR account cards) + security note card = 2-3 panels.
- `AccessibilitySettingsScreen` — hero card + text-size section + toggle cards = 2-3 panels.
- `AccountControlScreen` — hero card + option cards = 2-3 panels.
- `ActiveSessionsScreen` — trust surface card = 1 panel (compliant).
- `TwoFactorSetupScreen` — phase intro + QR frame = 1-2 panels (borderline).

The hero-card pattern is a shared defect across 6+ screens. Per AGENTS.md §4: "If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first." The shared primitive is the `heroCard` style pattern (rounded, bordered, `colors.surface`, icon + title + subtitle). The fix is to flatten heroes into a `FlagshipFormSection variant="state"` or a flat intro block (title + body text, no card) and reserve the single dominant panel for genuinely stateful content (the posture score, the export result, the consequence list).

### 3.12 SettingsRow icon hit-target — good, but value text truncation

`SettingsRow.tsx:107-111` — the `value` text uses `numberOfLines={1}` and `flexShrink: 1` with `maxWidth: '100%'`. With a long value (e.g. "System" for theme, or a long currency name), the value can push the chevron off-screen on narrow devices. The `right` container (`:160-166`) has `flexShrink: 1` but the value text does not have a hard maxWidth relative to the chevron. This is a minor defect but contributes to inconsistent right-edge alignment across rows.

### 3.13 Search results — no section grouping

`SettingsScreen.tsx:327-351` — search results are a flat list of `SettingsRow`s with the section name as `subtitle`. This is functional but loses the grouped-list hierarchy. iOS settings search shows results grouped by section. The current flat list is acceptable for a first pass but is not flagship.

---

## 4. Micro Improvements

These are localised fixes that do not change the settings architecture:

1. **Move "Delete account" to its own section at the bottom of SettingsScreen.** Remove the `danger` row from the "Your account" section (`SettingsScreen.tsx:423-429`). Add a final "Account" section with a single "Delete account" row, separated from the previous section by `marginTop: Space.lg`. This matches the 2026 destructive-separation benchmark and App Store 5.1.1(v) "easy to find" requirement.

2. **Remove `AccountSettingsScreen` redirect stub.** Delete `AccountSettingsScreen.tsx`, remove the navigator entry in `AppNavigator.tsx:207`, and update any remaining references to navigate directly to `EditProfile`.

3. **Hydrate `activityStatusVisible` and `searchVisibility` from backend on mount in `PrivacySettingsScreen`.** Replace the local `useState(true)` / `useState('visible')` initialisers with values from `accountPreferences` or a `fetchPrivacyPreferences()` call. Show a skeleton for the posture hero until hydration completes. This fixes the fabricated posture score.

4. **Ship the `DataPrivacyScreen` demo-mode banner in production, or persist the toggles to backend.** The `personalizedAds`, `recommendationPersonalization`, and `thirdPartySharing` toggles must either (a) call a backend endpoint and reflect server state, or (b) persist to AsyncStorage and show an honest "saved on this device" banner in production. Remove the `__DEV__` gate on `DATA_PRIVACY_DEMO_MODE`.

5. **Remove the fabricated fallback "current" session in `ActiveSessionsScreen`.** When `currentSessions.length === 0` and loading is complete, show a truthful empty state: "We couldn't identify this device's session. Pull to refresh." Do not invent a device name.

6. **Flatten `AccessibilitySettingsScreen` toggle rows into grouped lists.** Replace the individually-carded `toggleRow` style with a contiguous grouped list per section (Motion, Display, Screen reader) using `SettingsSection` + a new `SettingsToggleRow` primitive that shares the `SettingsRow` geometry. One rounded container per section, hairline separators between rows.

7. **Flatten `DataPrivacyScreen` data categories into `SettingsRow`s.** Replace the `dataList` of `dataItem`s (each with its own `dataIcon` mini-card) with flat `SettingsRow`s with leading icons. The hero card becomes a flat intro block (title + body text, no card).

8. **Flatten `PrivacySettingsScreen` safety tips into a flat info block.** Replace the `safetyTipsCard` with a `SettingsInfoBanner` (which already exists and is flat) or a flat list of checkmark rows without a card wrapper.

9. **Make `effectiveKycVerified` backend-authoritative.** In `VerificationScreen.tsx:130` and `VerificationStatusScreen.tsx:90`, change the merge to `effectiveKycVerified = kycBackendVerified` (backend is the only source of truth for *verified*). Use `kycVerifiedLocal` only to display a "pending" state when the backend is unreachable.

10. **Consolidate KYC submission into `KYCVerificationScreen`.** Remove the inline KYC form from `VerificationScreen.tsx:379-493`. `VerificationScreen` becomes a status + entry screen only; tapping "Start verification" navigates to `KYCVerificationScreen` (the 5-step wizard). `VerificationStatusScreen` remains the timeline.

11. **Improve 2FA entry copy.** In `ChangePasswordScreen.tsx:119-123`, replace "Add two-factor authentication for stronger protection" with the USENIX-winning mechanism explanation: "Turn on 2FA and we'll ask for a code if we see a login from a device we don't recognise." This is the phrasing that increased adoption by 28% in 2026 research.

12. **Add a `SettingsToggleRow` primitive.** The current `SettingsRow` supports toggles via `toggleValue`/`onToggle`, but the toggle is a `PremiumToggle` (custom animated). For accessibility-settings grouping, a variant that uses the native `Switch` (as `AccessibilitySettingsScreen` already does) would be more system-native. Expose this as a `SettingsRow` prop (`nativeSwitch`).

13. **Remove `SettingsCard` `glass` variant.** `SettingsCard.tsx:30-35` — the `glass` variant uses `Glass.bg`/`Glass.border`, which violates AGENTS.md §4 ("Dark mode is not permission to add translucent containers or glow"). Remove the variant and audit for any usage.

14. **Group search results by section.** In `SettingsScreen.tsx:327-351`, group `searchResults` by `dest.section` and render each group as a `SettingsSection` with the section name as title. This restores the grouped-list hierarchy in search.

---

## 5. Macro Improvements

### 5.1 Settings architecture — one canonical grouped-list system

The settings department has 16 screens using 3 different composition patterns: (a) `SettingsSection` + `SettingsRow` (flat, no card), (b) hero card + `SettingsSection` (card + flat), (c) individually-carded rows (`AccessibilitySettingsScreen`). The flagship architecture is one canonical system:

```
FlagshipScreen
  └─ FlagshipHeader (title, back)
  └─ SettingsGroup (title, icon, children)
       └─ SettingsRow (icon, title, subtitle, value, chevron/toggle)
       └─ SettingsRow ...
       └─ SettingsRow (isLast)
  └─ SettingsGroup ...
  └─ SettingsDestructiveSection (title, children)  ← red-tinted, bottom-placed
```

`SettingsGroup` is the iOS-grouped-list container: one rounded-rect surface per group, hairline separators between rows, no separator on first/last. `SettingsDestructiveSection` is a variant with a red eyebrow ("Danger zone") and red-tinted row titles. This replaces the current `SettingsSection` `noCard`/`card` split with a single grouped style, and replaces the per-screen `heroCard` pattern with a flat `FlagshipFormSection variant="state"` for status heroes.

### 5.2 Verification truthfulness — backend as the only source of truth

The verification department has three screens (`VerificationScreen`, `KYCVerificationScreen`, `VerificationStatusScreen`) with overlapping responsibilities and a fragile local/backend merge. The flagship architecture:

- **`VerificationScreen`** — status dashboard only. Shows current tier (email verified / KYC pending / KYC verified / KYC rejected), verification steps as `SettingsRow`s with truthful values, and a "Start verification" CTA. No inline form. Status is `backendKycStatus ?? 'unverified'` — never local optimistic.
- **`KYCVerificationScreen`** — the 5-step wizard. On submit, calls `createKycSession`, sets local `kycSubmittedAt` (for optimistic "in review" display only), and navigates to `VerificationStatusScreen`. Never sets `kycVerified: true` locally.
- **`VerificationStatusScreen`** — the timeline. Polls `fetchKycStatus` on focus. Shows `unverified` / `in_review` / `verified` / `rejected` based on backend status only. The `kycVerifiedLocal` flag is used only to display "submitted, awaiting backend sync" for the first 30 seconds after submission — after that, backend status is authoritative.

This removes the `||` merge (`kycVerifiedLocal || kycBackendVerified`) and makes it impossible for a stale local flag to fabricate "Verified".

### 5.3 Destructive action design — a shared ritual

ThryftVerse has two destructive flows (`DeleteAccountScreen`, `AccountControlScreen`) with different confirmation rituals. The flagship design is one shared destructive-action pattern:

```
Entry row (red, bottom-placed, in SettingsDestructiveSection)
  → Consequence screen (flat list of what disappears, no card)
  → Confirmation screen (typed phrase + password + biometric gate)
  → Success → navigation.reset to AuthLanding
```

`DeleteAccountScreen` already follows this (warning hero → consequences → typed DELETE + password + biometric). `AccountControlScreen` has a weaker version (overview → delete-info → typed DELETE, no password, no biometric). The fix is to align `AccountControlScreen`'s delete flow to the same ritual as `DeleteAccountScreen`, or to remove the delete path from `AccountControlScreen` entirely and route all deletion through `DeleteAccountScreen` (preferred — one canonical destructive path).

### 5.4 Privacy posture — truthful, hydrated, scoped

The "Privacy posture" score in `PrivacySettingsScreen` is a good idea (it makes privacy legible) but is currently fabricated from unhydrated local state. The flagship design:

- Hydrate all four inputs (`privateProfile`, `twoFactorEnabled`, `activityStatusVisible`, `searchVisibility`) from backend/store on mount.
- Show a skeleton for the posture hero until hydration completes.
- Label each input's source: "Private profile (account)", "2FA (security)", "Activity status (privacy)", "Search visibility (privacy)".
- Show last-updated time for each control.
- Remove the score if any input is unavailable — do not show "Open" when the real state is unknown.

### 5.5 Accessibility — system-native grouped lists, Dynamic Type

`AccessibilitySettingsScreen` should be the showcase for accessible settings design. The flagship version:

- Grouped lists (not individually-carded rows) for Motion, Display, Screen reader sections.
- Native `Switch` (not custom `PremiumToggle`) for accessibility toggles — system-native is more trustworthy for accessibility users.
- Text-size selector with live preview (already present — keep).
- A "Reset to system defaults" row that clears all app-level overrides and defers to iOS/Android system accessibility settings.
- Dynamic Type support: the screen itself must respect the text-size setting it exposes.

---

## 6. Flagship Acceptance Criteria

A flagship settings department must pass all of these:

1. **Grouped-list convention.** Every settings screen uses the one canonical `SettingsGroup` + `SettingsRow` system. No individually-carded rows. No card-on-card. The thumbnail test passes on every screen (repeated rounded rectangles do not dominate the silhouette).

2. **Destructive separation.** "Delete account" sits in its own `SettingsDestructiveSection` at the bottom of `SettingsScreen`, separated from benign rows by a section break. The label is verbatim "Delete account" (App Store 5.1.1(v)). The confirmation ritual is: consequence screen → typed DELETE + password + biometric gate → success → `navigation.reset` to AuthLanding.

3. **Truthful verification.** `effectiveKycVerified` is backend-authoritative. No local flag can fabricate "Verified". The verification status screen shows `unverified` / `in_review` / `verified` / `rejected` based on backend status only. The "in review" state is fully designed (timeline, ETA, resubmit path).

4. **Truthful privacy posture.** The posture score's four inputs are hydrated from backend/store on mount. A skeleton shows during hydration. The score is not displayed if any input is unavailable. Each input's source is labelled.

5. **Truthful privacy controls.** `DataPrivacyScreen` toggles persist to backend (preferred) or to AsyncStorage with an honest "saved on this device" banner that ships in production. No `__DEV__`-only disclosure.

6. **Truthful sessions.** `ActiveSessionsScreen` never fabricates a session. Empty/loading states are honest. The "current" badge only appears on a real session returned by the API.

7. **One canonical KYC flow.** `VerificationScreen` is status + entry. `KYCVerificationScreen` is the 5-step wizard. `VerificationStatusScreen` is the timeline. No inline KYC form in `VerificationScreen`. No duplicate screens.

8. **No dead screens.** `AccountSettingsScreen` redirect stub is removed. All navigator entries point to canonical screens.

9. **2FA adoption copy.** The 2FA entry uses mechanism-explanation copy ("we'll ask for a code if we see a login from a device we don't recognise"), not generic "added security" phrasing.

10. **Surface budget.** Each settings screen has at most one dominant non-media panel above the fold. Hero cards are flattened to `FlagshipFormSection variant="state"` or flat intro blocks. The safety-tips card, data-categories card, and accessibility toggle cards are flattened into grouped lists.

11. **State completeness.** Every settings screen has loading, populated, empty, error, and offline states. `ActiveSessionsScreen` and `ConnectedAccountsScreen` already have these — the pattern must extend to `DataExportScreen` (loading/success/error present), `DeleteAccountScreen` (submitting state present), and `VerificationStatusScreen` (loading/error present).

12. **Accessibility showcase.** `AccessibilitySettingsScreen` uses grouped lists, native switches, and respects its own text-size setting. A "Reset to system defaults" row is present.

13. **Search grouping.** Settings search results are grouped by section, not a flat list.

14. **Sign in with Apple revocation.** The delete-account flow calls Apple's revoke token endpoint if the user signed in with Apple (App Store 5.1.1(v) requirement). This is a backend integration — the frontend should trigger it as part of `deleteMyAccount` when a connected Apple account is present.

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness (highest priority, §11 violations)

1. Remove fabricated fallback "current" session in `ActiveSessionsScreen` (`:201-213`).
2. Hydrate `activityStatusVisible` / `searchVisibility` in `PrivacySettingsScreen` (`:29-30`); show skeleton for posture hero.
3. Make `effectiveKycVerified` backend-authoritative in `VerificationScreen` (`:130`) and `VerificationStatusScreen` (`:90`).
4. Ship `DataPrivacyScreen` demo banner in production OR persist toggles to backend (`:43`, `:62-64`).
5. Remove `AccountSettingsScreen` redirect stub and navigator entry.

### Phase 2 — Destructive separation & architecture

6. Move "Delete account" to a `SettingsDestructiveSection` at the bottom of `SettingsScreen`.
7. Remove the delete path from `AccountControlScreen` (route all deletion through `DeleteAccountScreen`), or align its ritual to match (add password + biometric).
8. Consolidate KYC: remove inline form from `VerificationScreen`; route all submission through `KYCVerificationScreen`.

### Phase 3 — Grouped-list system & surface budget

9. Introduce `SettingsGroup` (iOS-grouped-list container) and migrate `SettingsScreen` and all sub-screens to it.
10. Flatten hero cards on `PrivacySettingsScreen`, `DataPrivacyScreen`, `DataExportScreen`, `DeleteAccountScreen`, `ConnectedAccountsScreen`, `AccessibilitySettingsScreen`, `AccountControlScreen` to `FlagshipFormSection variant="state"` or flat intro blocks.
11. Flatten `AccessibilitySettingsScreen` toggle rows into grouped lists with native `Switch`.
12. Remove `SettingsCard` `glass` variant.

### Phase 4 — Polish & adoption

13. Update 2FA entry copy to mechanism-explanation phrasing in `ChangePasswordScreen`.
14. Group search results by section in `SettingsScreen`.
15. Add "Reset to system defaults" row to `AccessibilitySettingsScreen`.
16. Add Sign in with Apple token revocation to the delete-account flow (backend integration).

### Phase 5 — Verification (final)

17. Verify all 14 acceptance criteria pass.
18. Run the thumbnail test on every settings screen.
19. Run the squint test on every settings screen.
20. Confirm no `Coming soon`, no fabricated states, no dead chevrons, no card-on-card composition remains in the settings department.

---

**Audit complete.** The settings department is functionally rich but visually over-carded and has several truthfulness defects (fabricated posture score, dev-only demo banner, fabricated fallback session, fragile KYC merge). The flagship path is: fix truthfulness first, separate destructive actions second, migrate to one grouped-list system third, polish adoption copy fourth. The result should be a settings department that feels as deliberate and trustworthy as iOS Settings — the convention that is the entire job.
