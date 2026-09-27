# Audit — AUTH/ONBOARDING (mobile) — 2026-09-26

## Verdict
The auth stack is genuinely strong: real state machines (magic-link inline 2FA retry, biometric gate, reset token states), inline field errors with live regions, a password strength meter, honest age-gate copy, and reduced-motion respect throughout. It trails the web surface on three material points — there is no guest entry path, no autofill/password-manager metadata on any field, and the reset-password form lacks the strength meter and visibility toggles — and the onboarding permission-denial retry is a dead control on iOS. Composition itself is clean (top-left wordmark, bottom-anchored actions, one dominant CTA) and passes the anti-AI policy.

## Findings

### AO-01 — No "continue as guest" entry; entire guest infrastructure is unreachable [P1]
- Screens: `screens/AuthLandingScreen.tsx:496-579`, `screens/LoginScreen.tsx`, `navigation/AppNavigator.tsx:119-127`
- Evidence: AuthLanding offers only Apple/Google/passkey/sign-up/log-in; AppNavigator's unauthenticated initial route is `AuthLanding` with no path to `MainTabs`. Yet `useIsGuest` (`store/useStore.ts:3063-3068`), gated tabs + "Sign in" Profile tab (`TabNavigator.tsx:277,431-446`), `SignupWallSheet`, and the "Browsing as guest" header (`components/home/HomeHeader.tsx:75-84`) all exist — implemented but unreachable except via deep link (`hooks/useDeepLinkAuth.ts:15`).
- Web parity: `web/src/app/auth/login/page.tsx:134-139` has "Just looking? Continue as guest" → `/`.
- Competitor: Vinted/Depop allow full browse before signup wall; the wall fires on save/message, exactly what `SignupWallSheet` already implements.
- Root cause: the entry link was never added to AuthLanding/Login after guest mode landed.
- Fix: Add a quiet text link on AuthLanding (below the sign-in link) and on LoginScreen footer: "Just looking? Browse as guest" → `navigation.replace('MainTabs')`. Store stays unauthenticated; existing gating does the rest.
- Acceptance: A fresh unauthenticated user can reach the Home feed in ≤2 taps from AuthLanding; Inbox/Profile tabs show the signup wall; "Browsing as guest" indicator renders.

### AO-02 — No textContentType/autoComplete on any auth field — autofill and strong-password suggestion broken [P1]
- Screens: `screens/LoginScreen.tsx:104-141`, `screens/SignUpScreen.tsx:426-538`, `screens/ForgotPasswordScreen.tsx:150-163`, `screens/ResetPasswordScreen.tsx:184-218`, `screens/AuthLandingScreen.tsx:392-425`
- Evidence: zero `textContentType`/`autoComplete` props on email, password, new-password, username, OTP, or recovery fields. `ChangePasswordScreen.tsx:158-190` already uses `autoComplete="current-password"/"new-password"` + `textContentType`, so the codebase knows the grammar — auth surfaces just never got it. iOS therefore cannot offer saved-password autofill on Login, and cannot suggest/store a strong password on SignUp/Reset.
- Web parity: every `AuthField` carries `autoComplete` (`web/src/app/auth/signup/page.tsx:111,125,140`; `login/page.tsx:72,86`; `reset/page.tsx:160,177`).
- Competitor: baseline expectation — every listed reference app supports credential autofill.
- Root cause: `AppInput` passes `...rest` through to `TextInput`, so support exists; the screens simply omit the props.
- Fix: Add `textContentType="emailAddress" autoComplete="email"` on email fields, `"password"`/`current-password` on Login, `"newPassword"`/`new-password` on SignUp/Reset, `"username"` on handle, `"oneTimeCode"` on OTP/2FA code fields.
- Acceptance: iOS keychain/Android autofill prompts appear on Login; iOS offers "Suggest Strong Password" in SignUp and Reset.

### AO-03 — Notification-denial "Try again" is a dead loop on iOS — no Settings deep-link recovery [P1]
- Screens: `screens/OnboardingScreen.tsx:94-102,119-162`; `lib/pushPermission.ts:170-202`
- Evidence: on denial, "Try again" only calls `setPermissionDenied(false)` returning to the welcome panel; tapping "Get started" re-calls `requestPushPermissionWithContext` → `Notifications.requestPermissionsAsync`, which on iOS resolves `denied` **without re-showing the OS dialog** once denied. The user loops forever between the two panels; the only real recovery (system Settings) is never offered.
- Web parity: `web/src/app/onboarding/page.tsx:26-39` has the same limitation, but the web platform genuinely cannot open settings — mobile can via `Linking.openSettings()` / `IntentLauncher`.
- Competitor: standard native pattern post-denial is an "Open Settings" affordance.
- Root cause: denial recovery was designed for the re-promptable case only; `canAskAgain`/`status === 'denied'` is never distinguished.
- Fix: In `requestPushPermissionWithContext` return/inspect `canAskAgain`; when `denied && !canAskAgain`, swap "Try again" for "Open Settings" → `Linking.openSettings()`, and re-check status on app foreground (`AppState` listener) to auto-advance when granted.
- Acceptance: after an iOS denial, tapping the recovery action opens Settings; returning with permission granted completes onboarding.

### AO-04 — ResetPassword lacks strength meter and show/hide toggles; SignUp lacks show/hide [P1]
- Screens: `screens/ResetPasswordScreen.tsx:184-218`, `screens/SignUpScreen.tsx:451-497`
- Evidence: web reset renders `<PasswordStrength>` and eye toggles on both fields (`web/src/app/auth/reset/page.tsx:156-187`); mobile reset is two bare secure fields — a user re-typing a high-friction new password cannot verify it visually and gets no strength feedback. Mobile SignUp does have the 4-bar meter (`SignUpScreen.tsx:471-496`) but no visibility toggle anywhere; `AppInput` has `suffix` support but no built-in secure toggle.
- Web parity: `PasswordStrength` component + eye toggle on signup too (`web/src/app/auth/signup/page.tsx:148-159`).
- Competitor: show/hide is universal on the reference apps.
- Root cause: `AppInput` never grew a `secureTextEntry` trailing toggle.
- Fix: Add an eye `suffix` inside `AppInput` when `secureTextEntry` is set (a11y label "Show/Hide password", `accessibilityState` toggled); lift the SignUp strength meter into a shared component and render it under ResetPassword's new-password field.
- Acceptance: every secure auth field shows a working visibility toggle at 44pt target; Reset shows the same 4-bar meter as SignUp.

### AO-05 — Password minimum-length drift: mobile ≥8, web ≥6 [P2]
- Screens: `screens/SignUpScreen.tsx:226-230` ("Password must be at least 8 characters"), `screens/ResetPasswordScreen.tsx:20` (`MIN_PASSWORD_LENGTH = 8`)
- Evidence: web signup validates `password.length < 6` (`web/src/app/auth/signup/page.tsx:74`, placeholder "At least 6 characters" line 141) while mobile enforces 8. If the backend enforces one of these, one client misleads users; if it enforces neither floor, the two products disagree.
- Fix: confirm the backend rule and align both clients to it (ideally ≥8 everywhere, update web).
- Acceptance: identical minimum length enforced and messaged on both platforms.

### AO-06 — Forgot-password surfaces backend errors → account-enumeration parity gap [P2]
- Screens: `screens/ForgotPasswordScreen.tsx:52-56`
- Evidence: mobile `catch` renders the backend error verbatim (`setErrorMsg(error.message)`); web deliberately swallows errors — "Always resolves to the same sent state — the backend deliberately does not reveal whether the email exists" (`web/src/app/auth/forgot/page.tsx:36-41`). If the backend returns a distinguishable not-found/validation error, mobile leaks whether an account exists.
- Fix: on request failure, only show an error for network/5xx; for any 4xx resolve to the same `isSent` success state (or a neutral message).
- Acceptance: valid and invalid emails produce the identical sent-state UI on mobile.

### AO-07 — Biometric gate renders neutral outcomes as errors; `as any` cast [P2]
- Screens: `screens/BiometricLoginScreen.tsx:98-104,150-154,205`
- Evidence: `user_cancel` → "Authentication cancelled" and `user_fallback` → "Password fallback selected" render in `dangerText` as if they were failures; fallback is a legitimate path and cancel is not an error. Separately `fontWeight: TypographyV2.display.weight as any` (line 205) silences the type system — brief flags `any` casts.
- Fix: treat `user_fallback` by navigating to AuthLanding (or leaving silent, no banner); render cancel as muted info or nothing — keep danger only for real failures/lockout. Fix the weight typing (`fontWeight` expects a RN weight literal, map it properly).
- Acceptance: cancelling biometric shows no red text; fallback routes to manual sign-in; no `any` in the file.

### AO-08 — "I'm under 18" is a one-way dead end with back-swallow [P2]
- Screens: `screens/AgeVerificationScreen.tsx:75-80,98-108,110-146`
- Evidence: a mis-tap on "I'm under 18" lands on a denial state with no way back — Android back is already swallowed (`return true`), the denial panel offers only "Close app" (Android) or a text hint "Swipe up from the bottom to close" (iOS, which also assumes gesture navigation — wrong on home-button devices). Relaunch recovers (nothing persisted) but the in-app path is a dead end.
- Fix: add a quiet "Go back" / "I made a mistake" link in the denied state returning to the gate; adjust iOS copy to platform-neutral "Close the app to exit."
- Acceptance: an accidental under-18 tap is recoverable in-app without killing the app.

### AO-09 — Signup order drift: personalisation runs pre-auth on mobile [P2]
- Screens: `screens/OnboardingScreen.tsx:69` → `Personalisation { fromOnboarding: true }`; `screens/PersonalisationScreen.tsx:59-67` → `AuthLanding`
- Evidence: mobile onboarding → personalisation → **then** AuthLanding, so unauthenticated users write `personalisationPreferences` before any account exists and then hit a hard auth wall (compounded by AO-01). Web order is signup → `/onboarding` → home (`web/src/app/auth/signup/page.tsx:83-84`). Local-first prefs are persisted fine, but the flow invests the user in preferences for a product they can't yet see.
- Fix: either keep order but verify preferences actually hydrate into the feed post-signup, or reorder to AuthLanding → signup → onboarding → personalisation → MainTabs matching web.
- Acceptance: chosen preferences demonstrably shape the first feed after signup; ordering matches web or the divergence is deliberate and documented.

### AO-10 — Strength-meter "Good" uses bronze vs web's success green [P3]
- Screens: `screens/SignUpScreen.tsx:166` (`label: 'Good', color: colors.bronze`)
- Evidence: web maps Good → `text-success-text`/`bg-success` (`web/src/app/auth/signup/page.tsx:48-49`). Mobile's bronze is a deliberate-looking brand choice but reads weaker than web for the same score; verify it's intentional art direction, not drift.
- Fix: align to success token unless bronze is a signed-off brand decision.
- Acceptance: identical strength→colour mapping on both platforms or an explicit design sign-off.

## Non-findings (verified good)
- **AuthLanding composition**: top-left wordmark, bottom-anchored actions, two dominant social buttons + quiet text links, single-line terms — passes silhouette/surface-budget tests (`AuthLandingScreen.tsx:337-598`).
- **Magic-link 2FA**: inline challenge with token retention across retry, recovery-code toggle, assertive live regions, disabled-while-verifying (`AuthLandingScreen.tsx:143-201,373-484`).
- **SignUp progressive disclosure**: 3-step flow with progress bar, per-step validation + inline errors, strength meter with a11y label, haptic + reduced-motion respect, referral code optional, explicit terms checkbox with `accessibilityRole="checkbox"`/`accessibilityState` (`SignUpScreen.tsx`).
- **Login**: email/password validation via `validatePasswordLogin` with field errors, attempts-remaining countdown surfaced, OTP + magic-link + social all with loading/disabled states (`useLoginSubmission.ts:72-119`, `LoginScreen.tsx`).
- **Forgot/Reset**: full state machine — sent + resend + spam hint + offline disable + incomplete-token and success dead-end states with recovery CTAs (`ForgotPasswordScreen.tsx`, `ResetPasswordScreen.tsx:100-158`).
- **AgeVerification**: honest self-declaration copy ("stored on your device… may require verification later"), dominant/quiet action hierarchy, persisted via SecureStore, safe-failure on storage error (`AgeVerificationScreen.tsx:34-53,164-168`).
- **BiometricLogin**: real hardware probe → auto-prompt → fallback-to-sign-in when unavailable; session snapshot + best-effort `restoreAuthSession`; honest comments (`BiometricLoginScreen.tsx:48-124`).
- **BrandedSplash**: per-letter stagger capped ~1.95s, reduced-motion 700ms path, no decorative chrome (`BrandedSplash.tsx:19-43`).
- **a11y broadly**: `accessibilityRole/Label/Hint/State` and `accessibilityLiveRegion` present on virtually all controls and error surfaces; `maxFontSizeMultiplier` caps throughout.
