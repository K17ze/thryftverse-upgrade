# Audit — Settings/Account/Utility/Support (mobile) — 2026-09-26

## Verdict
The department is far past card-fatigue territory: the settings hub is a flat canvas with hairlines and section components, the notification surface is a server-synced category matrix with pause/resume snapshot semantics and quiet hours, sessions are real and revocable, data export produces a real JSON file, and delete-account is a proper typed-confirmation ritual with OAuth re-auth and blocker translation. The remaining gaps are concentrated: two dishonest/degraded paths (toast-only export in AccountControl, self-navigating recovery CTA), a source-of-truth inconsistency between the sibling blocked/restricted managers, a divergent report-reason vocabulary on the profile sheet, and ticket-level escalate/CSAT parity vs web.

## Findings

### S1 — Intervention "recovery" next-action dead-routes to the screen you're already on [P1]
- Screens: `frontend/src/screens/AccountSecurityScreen.tsx`
- Evidence: lines 313–332. When `intervention.nextAction.route === '/account-security/recovery'` the handler calls `navigation.navigate('AccountSecurity')` — pushing a duplicate copy of the current screen. The inline comment admits the intervention state "doesn't carry the caseId directly" so the button does nothing meaningful during an active security incident — the highest-stakes moment on the surface.
- Web parity: web settings/security routes recovery CTAs to the actual recovery flow.
- Competitor: eBay/Google account-security grammar — the one dominant action must actually perform the recovery step.
- Root cause: route contract returns a web path (`/account-security/recovery`) that was never mapped to a native route + caseId param.
- Fix: extend the intervention contract to carry `caseId`, map `/account-security/recovery` → `navigation.navigate('AccountSecurityRecovery', { caseId })`; fall back to `declareCompromise` when no caseId.
- Acceptance: tapping the intervention CTA during a `recovery_in_progress` incident opens `AccountSecurityRecovery` with the live case; never pushes a duplicate Security screen.

### S2 — "Download your data" in AccountControl delivers only a toast; duplicates DataExportScreen with no file [P1]
- Screens: `frontend/src/screens/AccountControlScreen.tsx`, `frontend/src/screens/DataExportScreen.tsx`
- Evidence: AccountControlScreen.tsx:34–50 calls `requestMyDataExport()` then shows `show('Data export generated… Request ID: …')` — the user never receives a file. DataExportScreen.tsx:80–103 does the honest flow: `expo-file-system` write + `react-native-share` sheet for a real JSON blob. Two settings rows (`SettingsAccountSection` lines 87, 93) navigate to two different export surfaces with materially different outcomes.
- Web parity: `web/src/app/settings` data section performs a real JSON export (blob download).
- Competitor: GDPR portability expectation — an export that yields no artefact is a Truthful UI violation.
- Root cause: legacy AccountControl export path left behind after DataExportScreen was built; `requestMyDataExport` result payload is discarded.
- Fix: make the AccountControl row navigate to `DataExport` (or share the same download helper); remove `requestMyDataExport` toast-only path.
- Acceptance: every "download my data" entry point ends with the OS share sheet handing off a `thryftverse-export-*.json` file.

### S3 — RestrictedAccountsScreen is store-driven with no error state; divergent source of truth vs BlockedUsersScreen [P1]
- Screens: `frontend/src/screens/RestrictedAccountsScreen.tsx`, `frontend/src/screens/BlockedUsersScreen.tsx`
- Evidence: RestrictedAccountsScreen.tsx:38–51 — `getRestrictedUsers()` failure silently sets `serverEntries([])` (no `loadError`, no retry UI); lines 69–78 render `restrictedIds` from the local store as the list source, so accounts restricted from another device/session that the store never hydrated are invisible; line 109 renders "Profile details could not be loaded" rows indistinguishable from genuinely unavailable accounts. BlockedUsersScreen.tsx:34–53 was already fixed to render server entries with error/retry — the sibling surface never got the same pass.
- Web parity: `web/src/app/settings/privacy` restricted manager is server-driven.
- Competitor: Instagram restricted-accounts list shows server truth with graceful degradation.
- Root cause: Restricted screen predates the Blocked screen's server-source-of-truth refactor.
- Fix: mirror the Blocked pattern — render rows from the fetched payload, add `loadError` + retry `EmptyState`, use the store only for optimistic removal.
- Acceptance: fetch failure shows error+retry; a restriction made on web appears on mobile without manual store sync.

### S4 — Profile report sheet uses a different 6-reason vocabulary than the canonical 12-reason list [P1]
- Screens: `frontend/src/components/profile/ProfileSheets.tsx`, `frontend/src/utils/reportLogic.ts`, `frontend/src/screens/ReportScreen.tsx`
- Evidence: ProfileSheets.tsx:104–111 defines its own `REPORT_REASONS` (`spam, inappropriate, counterfeit, unresponsive, harassment, other`) — including a `unresponsive`/`inappropriate` taxonomy absent from the canonical `reportLogic.ts:31–92` 12-reason set used by ReportScreen (spam, harassment, hate_speech, counterfeit, prohibited, off_platform, scam, misinformation, privacy, impersonation, minor_safety, other). Reporting the same user from the profile sheet vs the Report flow produces different reason enums sent to the same `reportUser` endpoint.
- Web parity: web report uses the single verbatim 12-reason list.
- Competitor: Instagram/eBay report taxonomy is identical regardless of entry point.
- Root cause: ProfileReportSheet was authored before the canonical reason list; never unified.
- Fix: delete the local constant; render `REPORT_REASONS` from `reportLogic` in the sheet (compact single-line rows).
- Acceptance: every report entry point offers the identical 12 reasons and submits values from the same union type.

### S5 — Ticket detail lacks escalate / accept-resolution / CSAT; feedback is binary only [P2]
- Screens: `frontend/src/screens/SupportTicketDetailScreen.tsx`, `frontend/src/hooks/supportconversation/useSupportConversationActions.ts`
- Evidence: SupportTicketDetailScreen.tsx:441–490 offers only Close / Reopen / View conversation / Order link — no escalate, no accept-resolution, no satisfaction capture. useSupportConversationActions.ts:72 submits `'helpful' | 'unhelpful'` — binary, no 1–5 rating, no note.
- Web parity: `web/src/components/support/TicketThread.tsx:174–200` + `CsatPrompt` — Accept resolution, Escalate, CSAT rating + note on resolved cases; `useSupportTickets.ts` handles accept/escalate/csat transitions.
- Competitor: eBay resolution centre grammar — buyer accepts or escalates an outcome, then rates.
- Root cause: ticket surface models only status transitions; resolution disposition and CSAT contracts exist server-side (`resolutionDisposition`, `SupportCaseEvent`) but no UI affordance.
- Fix: add an "Accept resolution / Escalate" action pair when a resolution is proposed, and a compact 1–5 CSAT strip on resolved tickets; wire to existing case endpoints.
- Acceptance: a resolved ticket can be accepted or escalated and rated 1–5 with note; state persists and re-renders as submitted CSAT.

### S6 — Notification posture fragmented across three screens; no single channel matrix [P2]
- Screens: `frontend/src/screens/NotificationPreferencesScreen.tsx`, `PushNotificationsScreen.tsx`, `EmailNotificationsScreen.tsx`
- Evidence: PushNotificationsScreen.tsx is device-registration only (one toggle + link); NotificationPreferences owns push categories/quiet hours/preview; EmailNotifications owns the email category matrix. A user auditing "what reaches me, on which channel" must visit three surfaces; push and email category names overlap (`orderUpdates`, `auctionAlerts`…) with no side-by-side matrix.
- Web parity: `web/src/app/settings/notifications` renders a push×email matrix with pause-resume + quiet hours on one page.
- Competitor: Vinted/eBay notification settings are a single grouped matrix.
- Root cause: channel sub-screens accreted around the canonical preferences screen.
- Fix: keep the three screens (deep links exist) but add a compact channel-summary block at the top of NotificationPreferences showing push-permission + device-registration + enabled-email-count, deep-linking to each sub-screen; or merge email categories into the same grouped list with a channel column.
- Acceptance: from one viewport the user can see push posture, email posture, and quiet-hours state without navigating.

### S7 — Spinner loading where the contract requires skeletons [P2]
- Screens: `frontend/src/screens/NotificationPreferencesScreen.tsx`, `HelpSupportScreen.tsx`, `AccountSecurityScreen.tsx` (sessions)
- Evidence: NotificationPreferencesScreen.tsx:366–372 renders `ActivityIndicator` + "Loading preferences…" for the category list; HelpSupportScreen.tsx:328–331 and 414–416 spinners for search and bootstrap; AccountSecurityScreen.tsx:243 uses `FlagshipState variant="loading"` (generic). Meanwhile `SettingsListSkeleton`, `ConnectedAccountsSkeleton`, `BuyerProtectionSkeleton` exist and are used elsewhere — inconsistent state grammar within one department.
- Web parity: web TicketThread/settings use skeletons.
- Root cause: newer screens got purpose-built skeletons; these surfaces kept legacy spinners.
- Fix: reuse `SettingsListSkeleton` for preference groups and conversation/case rows.
- Acceptance: no `ActivityIndicator` renders as the primary loading affordance in this department; skeletons mirror row geometry.

### S8 — "Email and password: Not set — add one" implies an action that does not exist [P3]
- Screens: `frontend/src/screens/ConnectedAccountsScreen.tsx`
- Evidence: line 171 `subtitle={hasPassword ? 'Active' : 'Not set — add one'}` on a non-interactive row. The file's own comment notes "there is no add-password route — ChangePassword requires a current password," so an OAuth-only user reading "add one" has no path to act on it.
- Web parity: web connected-accounts either links a real add-password flow or doesn't suggest one.
- Root cause: copy left over from a planned add-password flow that never shipped.
- Fix: change copy to a truthful state ("Not set") or, better, implement an add-password flow (email-verified set-password) since OAuth-only accounts currently cannot acquire a password at all — a real account-recovery gap.
- Acceptance: no copy promises an unavailable action; OAuth-only accounts have a documented path to add a password.

### S9 — Department-wide i18n inconsistency: several screens hardcode English [P3]
- Screens: `HelpSupportScreen.tsx`, `EmailNotificationsScreen.tsx`, `SustainabilityPreferencesScreen.tsx`, `ConnectedAccountsScreen.tsx`, `AccountControlScreen.tsx`, `AccountSecurityScreen.tsx`, `DataPrivacyScreen.tsx`
- Evidence: e.g. HelpSupportScreen.tsx:259 'Talk to a person', :340 "No articles match…", category labels lines 57–63; EmailNotificationsScreen.tsx GROUPS constants lines 47–123 hardcode labels. Meanwhile SettingsScreen, ReportScreen, AppealScreen, ResolutionCentreScreen are fully keyed through `useAppTranslation`.
- Root cause: per-screen refactors landed at different times; i18n was applied inconsistently.
- Fix: extract hardcoded copy into the `settings`/`support` namespaces.
- Acceptance: no user-facing string literal remains in the department's render paths.

## Non-findings (verified good)
- **Settings hub**: flat canvas + hairlines, section components, inline search, hydration skeleton, bottom-sheet pickers correctly rendered outside the ScrollView (`SettingsScreen.tsx:99–243`).
- **Notification matrix**: server-persisted categories with optimistic update + rollback, pause/resume snapshot mix (not a reset), quiet hours with timezone sent to server, lock-screen preview policy, denied-permission banner with "Open settings", test push through the real pipeline (`NotificationPreferencesScreen.tsx`).
- **Sessions**: server-derived inventory, "This device" marker, per-session revoke + revoke-others with confirmation, relative last-active (`AccountSecurityScreen.tsx:357–489`); legacy `ActiveSessionsScreen`/`AccountSettingsScreen` correctly reduced to replace-redirects.
- **Data export**: real `expo-file-system` JSON write + `Share.open` handoff, per-category record counts, idle/loading/success/error states (`DataExportScreen.tsx`).
- **Delete account**: biometric gate, typed-DELETE zod validation, password-or-OAuth-proof branching, TOTP when 2FA on, 409 blocker translation into human copy (`DeleteAccountScreen.tsx`).
- **Accessibility**: only toggles with real global consumers retained (bold-text/screen-reader toggles removed as decorative), live text-size preview, `maxFontSizeMultiplier` respected (`AccessibilitySettingsScreen.tsx`).
- **Report flow**: canonical 12 reasons, staged submit (reason → details/evidence), evidence grid with upload states, success view with block action, unavailable-target state (`ReportScreen.tsx`, `reportLogic.ts`).
- **Support**: knowledge search with debounce + error/empty states, recent conversations & cases, human handoff, conversation screen with optimistic send/retry/offline banner (`HelpSupportScreen.tsx`, `SupportConversationScreen.tsx`).
- **Email matrix**: grouped (Essential/Shopping/Co-Own/Marketing), locked security-alerts row, optimistic toggle + rollback, refresh + error empty state (`EmailNotificationsScreen.tsx`).
- **2FA**: real QR generation, manual-key reveal, recovery codes with copy + sensitive-state cleanup, disable flow (`TwoFactorSetupScreen.tsx`).
- **Sustainability**: honest empty state, methodology disclosure, greenwashing toggle removed per EU 2024/825, debounced server persistence (`SustainabilityPreferencesScreen.tsx`).
- **Privacy**: consent toggles server-synced via `patchPrivacyConsent` with rollback — the "synced to your account" banner is truthful (`SettingsPreferencesContext.tsx:264–351`).
- **Appeal**: full state machine (loading/error/window-closed/offline/success), evidence filmstrip, ≥10-char grounds gate (`AppealScreen.tsx`).
