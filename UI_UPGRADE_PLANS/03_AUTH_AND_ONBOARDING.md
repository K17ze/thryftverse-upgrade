# 03 — Auth & Onboarding Playbook

> Screens: `AuthLandingScreen`, `LoginScreen`, `SignUpScreen`, `ForgotPasswordScreen`, `PersonalisationScreen`
> Heritage plans: AESTHETIC_CROSSCHECK_PLAN §3, OVERALL_AESTHETIC_ELEVATION §12.1
> Reference images: inherits from `overall outlook.jpeg` (master aesthetic)

---

## 1. Current State Snapshot

| Screen | Existing Quality | Gap |
|---|---|---|
| `AuthLandingScreen` | ✅ **Premium** — `GlassCard`, `GlowSurface`, `AmbientGradient`, gold CTA | Polish only |
| `LoginScreen` | Solid `AppCard variant="surface"` form | Swap to `GlassCard`, use `AppInput variant="glass"` |
| `SignUpScreen` | Same as Login | Same |
| `ForgotPasswordScreen` | Solid form card | Same |
| `PersonalisationScreen` | Solid quiz cards | Swap to `GlassCard` |

**Honest audit verdict**: `AuthLandingScreen` is the showcase — keep its patterns. The other 4 auth screens need Pattern 1 (Solid→Glass) applied consistently.

---

## 2. Target State — Per-Screen Edits

### 2.1 `AuthLandingScreen.tsx` (POLISH ONLY)

**Verify these are present** (they should be):
- `AmbientGradient` background with `Gradients.ambient.warm`
- Hero image with parallax (subtle)
- `GlassCard` for hero card
- `GlowSurface` behind primary CTA
- `GlowOrb` behind secondary text/logo
- `FadeInUp` staggered entrance
- `AnimatedPressable` for all buttons

**Minor improvements**:
- Hero text: `Type.display` (32/700/-0.5) for main headline
- Subtext: `Type.body` (15/500)
- Tagline: `Type.meta` (11/600, uppercase, muted)
- Add `accessibilityLabel` to social login buttons: "Continue with Apple", "Continue with Google"

### 2.2 `LoginScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/LoginScreen.tsx`

**Edits**:
1. Form card container: `AppCard variant="surface"` → `GlassCard intensity={25} tint="dark" borderRadius={20}`
2. All `AppInput` → `AppInput variant="glass"`
3. Submit button: `AppButton variant="primary" size="lg"` (already correct — verify)
4. Forgot password link: `AppButton variant="ghost"` (already correct — verify)
5. Social login buttons: glass style — `backgroundColor: 'rgba(255,255,255,0.05)'`, `borderColor: Glass.border`
6. Add `FadeInUp` to form card entrance
7. Header: `ScreenHeader` with glass-styled back button (Pattern 2)

**Result**:
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <ScreenHeader title="Welcome Back" showBack />
  <FadeInUp duration={400} delay={100}>
    <GlassCard intensity={25} tint="dark" borderRadius={20} style={{ margin: Space.md, padding: Space.lg }}>
      <AppInput variant="glass" label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <View style={{ height: Space.md }} />
      <AppInput variant="glass" label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <View style={{ height: Space.lg }} />
      <AppButton variant="primary" size="lg" fullWidth onPress={handleLogin}>Sign In</AppButton>
      <View style={{ height: Space.md }} />
      <AppButton variant="ghost" onPress={handleForgot}>Forgot password?</AppButton>
    </GlassCard>
  </FadeInUp>
  <View style={styles.socialContainer}>
    <SocialButton provider="apple" />
    <SocialButton provider="google" />
  </View>
</SafeAreaView>
```

### 2.3 `SignUpScreen.tsx` (REFACTOR)

Same as Login: glass form card, glass inputs, glass back button, fade-in entrance.

**Add**: Password strength indicator as a small gold bar under the password input (use `Colors.brand` for strong, `Colors.danger` for weak, `Colors.textMuted` for none).

### 2.4 `ForgotPasswordScreen.tsx` (REFACTOR)

Same pattern. Single input + send reset link button. Add a `GlowOrb` behind the envelope icon for visual delight.

### 2.5 `PersonalisationScreen.tsx` (REFACTOR)

- Quiz question cards: `AppCard variant="surface"` → `GlassCard intensity={25} borderRadius={20}`
- Option chips (categories, styles): each chip uses `GlassCard` with `borderColor: Glass.border`
- Selected chip: `borderColor: Colors.brand` + `shadowColor: Glow.brand`
- Step progress dots: small `Colors.brand` circles, completed = solid, current = ring, future = muted
- Continue button: `AppButton variant="primary" size="lg"` with `GlowSurface` wrapper

---

## 3. Acceptance Criteria

- [ ] All 4 form screens (Login, SignUp, ForgotPassword, Personalisation) use `GlassCard` for their main form container
- [ ] All form inputs use `AppInput variant="glass"`
- [ ] All CTAs use `AppButton variant="primary" size="lg"`
- [ ] All back/close icon buttons use Pattern 2 (glass)
- [ ] All entrance animations present (`FadeInUp` or `FadeInDown` with stagger)
- [ ] All haptics correct (light for taps, medium for submit, error for invalid)
- [ ] AuthLandingScreen unchanged (or only minor polish)
- [ ] `npm run typecheck` passes for all 5 files
- [ ] Visual diff against `overall outlook.jpeg` ≥ 90% match

---

## 4. Feature Preservation Checklist

- [ ] Email/password validation
- [ ] "Show password" toggle on password input
- [ ] Social login (Apple, Google, Facebook) buttons
- [ ] "Forgot password" link
- [ ] Navigation to SignUp
- [ ] Form error display (red text, shake animation)
- [ ] Loading state (button shows spinner)
- [ ] Personalisation: 5-7 step quiz with back/forward nav
- [ ] Personalisation: brand/style preferences saved to store
- [ ] All keyboard avoiding behavior intact
- [ ] Safe area handling correct

---

**Next**: Read `04_HOME_AND_DISCOVERY.md` for Home, Browse, Search, Filter, Category screens.
