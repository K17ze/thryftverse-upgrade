# ThryftVerse Flagship Upgrade — Inputs, Form Fields & Form Composition

**Document type:** Design.md-style research & implementation contract
**Scope:** Every input/form variant in the ThryftVerse React Native app — text fields, search bars, select rows, segment controls, form sections, navigation rows, and inline screen-level `TextInput` usage.
**Benchmark date:** August 2026
**Canonical references:** AGENTS.md §4 (stroke grammar, "Editable fields must look editable"), §13 (control quality), §14 (state completeness), §27 (2026 flagship UX psychology); Design.md "Form field micro spec", "Component D — Edit Profile", "Settings row micro spec", "Shape, stroke and surface budget".

---

## 1. 2026 Competitor Benchmark — Input & Form Design

### 1.1 Instagram (Meta)

Instagram's 2026 input surfaces are defined by **restraint and immediacy**. The Edit Profile form uses top-aligned labels, a 1pt neutral border that thickens to 2pt brand-blue on focus, and a subtle background tint shift — three stacked signals so focus survives bright sunlight. The bio field uses a character counter that only turns warning-colour at 90% capacity. Search bars are borderless filled pills with a magnifying glyph and an animated clear button; focus is communicated by a 2pt ring plus a faint background lift, never by a heavy shadow. Comment composers are bottom-docked, keyboard-aware, and never cover the last visible message. The lesson: **focus is a multi-signal event, not a single border swap**.

### 1.2 Pinterest

Pinterest's 2026 search and filter inputs are **almost invisible at rest**. The search bar is a filled surface (`surfaceAlt` equivalent) with no border; on focus a 2pt brand-colour ring appears and the surface lifts to white. Filter chips use a segmented-control-like pill row with a spring-animated indicator. Pinterest's form surfaces (board creation, account settings) use top-aligned labels, 52pt field height, and inline validation that appears on blur — never while typing. The lesson: **resting inputs should recede; focused inputs should announce**.

### 1.3 eBay

eBay's 2026 listing and checkout forms are **transactional and dense**. Fields use 48pt height, 1pt borders, top-aligned labels, and aggressive `keyboardType` mapping (decimal-pad for prices, phone-pad for contact, url for links). Error states use a 2pt danger border plus inline error text with a recovery suggestion. Disabled fields use 0.4 opacity on the entire field group, not just the text. The lesson: **correct keyboard type and inline error recovery are baseline, not polish**.

### 1.4 Snapchat

Snapchat's 2026 auth and settings inputs are **minimal and gestural**. Fields are underline-only (no full border), 1pt at rest, 2pt brand-yellow on focus. Labels float above. The segmented control for switching between "Log in" / "Sign up" uses a spring-animated underline indicator. The lesson: **underline appearance is valid for auth surfaces, but must still follow the 1pt→2pt focus grammar**.

### 1.5 Depop & Vinted (social-commerce peers)

Depop's 2026 Edit Profile form — the direct competitor to ThryftVerse's Component D — uses compact 52pt fields, top-aligned labels, `colors.input`-equivalent backgrounds, and a 2pt black focus border. Vinted's settings rows are transparent with hairline separators, 56–64pt height, and a chevron that never collides with the trailing value. Both use segmented controls for 2–4 option switches with a spring-animated pill indicator. The lesson: **social-commerce forms are compact, editable-looking, and consistent in stroke grammar**.

**Sources:**
- https://www.pravinkumar.co/blog/webflow-form-input-design-2026 — 2026 focus state: 2pt ring + border + tint shift, three stacked signals
- https://lollypop.design/blog/2026/january/text-field-design/ — 2026 text field design: persistent labels, visible borders, state clarity
- https://www.eleken.co/blog-posts/segmented-control-ui — Segmented control: 2–5 options, 44pt iOS / 48pt Android targets
- https://stripe.com/resources/more/mobile-checkout-ui — Mobile checkout: 44px minimum targets, single-column, labels outside fields
- https://antforms.com/blog/designing-for-the-thumb-9-tips-for-mobile-friendly-forms/ — Thumb-zone CTA placement, 48px+ targets

---

## 2. Psychology & Principles

### 2.1 "Editable = Inviting"

Per AGENTS.md §4 and Design.md rule 5: **"Editable fields must look editable. Use `colors.input` or transparent backgrounds with clear borders/focus states; never flat mid-grey blocks that read as disabled."** This is not aesthetic preference — it is cognitive. A user scanning a form makes a snap judgment in under 400ms about whether a surface accepts input. A field with no border, a `surfaceAlt` grey fill, and no focus affordance reads as **locked or decorative**. The user hesitates, taps experimentally, and loses confidence. A field with a 1pt border, a white/`input` background, and a visible cursor on tap reads as **active and expecting input**. The border is the invitation.

### 2.2 Cognitive Ease in Forms

Don Norman's three levels of emotional design (AGENTS.md §27.1) apply directly to forms:
- **Visceral:** Spacing rhythm, consistent field geometry, and clean labels make the form feel "edited and deliberate" before the user reads a word.
- **Behavioral:** Correct `keyboardType`, instant focus feedback (<100ms), and inline validation on blur make the form feel responsive and competent.
- **Reflective:** Error messages that suggest a fix, character counters that warn before the limit, and truthful disabled states make the form feel trustworthy.

Cognitive fluency research (AGENTS.md §27.1) shows that easy-to-process interfaces feel premium. Forms with consistent field heights, one stroke grammar, and top-aligned labels reduce visual noise and let the user focus on content, not chrome.

### 2.3 One Field at a Time — Focus Hierarchy

When a user focuses a field, that field must become the **visual centre of gravity**. The 2026 best practice (Pravin Kumar, April 2026 audit) is a three-signal focus state: (1) 2pt brand-colour border, (2) subtle background tint shift, (3) label colour shift to brand. A single signal — just a border colour swap — is invisible on a phone in daylight. The focus state should land on the **entire form group** (label + field + helper), not just the input rectangle, so the user has a second visual anchor.

### 2.4 Error Recovery

Per WCAG 3.3.1 (Error Identification), 3.3.3 (Error Suggestion), and the W3C cognitive accessibility pattern "Make it Easy to Undo Form Errors" (https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p05-form-undo/):
- Errors must be identified **in text**, not by colour alone.
- Error messages must tell the user **what went wrong and how to fix it**.
- The error must be **programmatically linked** to the field (React Native: `accessibilityLabel` + `accessibilityLiveRegion`).
- The user must be able to **return to the error field easily** without losing other input.
- Inline validation should fire **on blur**, not while typing — validating mid-typing interrupts the user and increases abandonment.

### 2.5 Form Confidence

A form communicates confidence through:
- **Consistent geometry** — every field the same height, radius, and stroke grammar.
- **Persistent labels** — labels above fields, never placeholder-only (placeholder disappears on focus, losing context).
- **Visible state language** — default, focus, error, disabled, read-only are all visually distinct.
- **Keyboard awareness** — the focused field is never covered by the keyboard (`KeyboardAwareScrollView`).
- **Truthful disabled state** — 0.4 opacity on the entire field group, not just text; never a grey fill that looks like a disabled block but is actually editable.

**Sources:**
- https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p05-form-undo/ — Cognitive accessibility: undo form errors
- https://accessalyze.com/blog/accessible-error-messages-forms.html — WCAG 3.3: error identification, suggestion, and `aria-describedby`
- https://www.bbc.co.uk/accessibility/forproducts/guides/mobile/error-messages-and-correction — BBC: inline error messages, `aria-invalid`, return to error field
- https://fomr.io/blog/accessible-form-design — Accessible form design: contrast, keyboard, focus visible, labels

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Three (arguably four) duplicate input systems

The codebase has **three separate text-input components** plus a fourth inline pattern, all doing the same job with different geometry:

| Component | File | min-height | Disabled opacity | Focus stroke | Default stroke | Background |
|-----------|------|-----------|-----------------|-------------|----------------|------------|
| `AppInput` | `components/ui/AppInput.tsx:146` | **48** | **0.6** | `Stroke.emphasis` (2pt) | `Stroke.standard` (1pt) | `colors.input` |
| `PremiumTextField` | `components/ui/PremiumTextField.tsx:134` | **52** | **0.55** | `Stroke.standard` (1pt) for filled; `Stroke.emphasis` (2pt) for underline | 0pt (filled, no border at rest) | `colors.surfaceAlt` |
| `PremiumInputShell` | `components/ui/PremiumInputShell.tsx:97` | **54** | **0.55** | 1pt (always `borderWidth: 1`, no emphasis) | 1pt | `colors.surfaceAlt` |
| `ProfileEditField` (inline) | `screens/EditProfileScreen.tsx:469` | **52** | N/A (no disabled) | `Stroke.emphasis` (2pt) | `Stroke.standard` (1pt) | `colors.input` |

**Defects:**
- **Three different min-heights**: 48, 52, 54. A user moving from a screen using `AppInput` to one using `PremiumInputShell` sees fields jump by 6pt. This violates AGENTS.md §4 "consistent alignment."
- **Three different disabled opacities**: 0.6, 0.55, 0.5 (PremiumSelectRow). Disabled state is not a design choice per field — it is a system language.
- **Three different stroke grammars**: `AppInput` uses 1pt→2pt on focus (correct per Design.md). `PremiumTextField` filled mode uses **0pt at rest → 1pt on focus** — the field has no border until focused, which violates "fields and explicit outlines are 1pt" (AGENTS.md §4). `PremiumInputShell` uses **1pt always**, never thickening to 2pt on focus — focus is only communicated by border colour change, which is a single signal and fails the daylight test.
- **Two different background tokens**: `AppInput` and `ProfileEditField` use `colors.input` (white in light mode). `PremiumTextField` and `PremiumInputShell` use `colors.surfaceAlt` (grey). Per Design.md: "Background: `colors.input` or transparent — never `colors.surface` (looks disabled)." `surfaceAlt` is a grey fill that reads as disabled-adjacent.

### 3.2 Inconsistent focus state language

| Component | Focus signal count | Signals |
|-----------|-------------------|---------|
| `AppInput` | 1 | Border colour → brand, border width 1→2pt |
| `PremiumTextField` | 1 | Border colour → brand (filled mode: border appears 0→1pt) |
| `PremiumInputShell` | 1 | Border colour → brand (width stays 1pt) |
| `ProfileEditField` | 1 | Border colour → brand, border width 1→2pt |
| `AppSearchBar` | 1 | Border appears 0→1pt, colour `textSecondary` (not `brand`) |

**Defects:**
- No component implements the 2026 best practice of **three stacked signals** (border + tint + label colour). `PremiumTextField` and `ProfileEditField` shift label colour on focus, but neither shifts the background tint.
- `AppSearchBar` (`AppSearchBar.tsx:94-95`) uses `Stroke.standard` (1pt) on focus, not `Stroke.emphasis` (2pt). This violates AGENTS.md §4: "2pt is reserved for focus or selection." A search bar focus is still a focus.
- `AppSearchBar` uses `colors.textSecondary` as the focus border colour (`AppSearchBar.tsx:95`), not `colors.brand`. Every other input uses `colors.brand` on focus. The search bar is visually disconnected from the form language.
- `PremiumInputShell` never thickens its border on focus (`PremiumInputShell.tsx:166`: `borderWidth: 1` is static). This is the most serious focus defect — the user gets only a colour change from `colors.border` to `colors.brand`, which is a subtle grey-to-black shift in light mode and nearly invisible in dark mode.

### 3.3 Missing error states

- `AppSearchBar` has **no error state** at all — no `errorText` prop, no danger border. If search validation fails, there is no visual language for it.
- `AppSegmentControl` has **no error or disabled state**. It cannot be marked invalid or disabled. If a segmented control is used in a form context (e.g., required selection), there is no way to show "this is required."
- `PremiumSelectRow` has error state (`PremiumSelectRow.tsx:35-37`) but **no focus state** — it is a pressable, not a text input, but it has no pressed-state border feedback. The row uses `AnimatedPressable` with `activeOpacity: 0.8`, which is only an opacity dim. No border colour change on press.
- `FlagshipNavigationRow` has **no error state** — it supports `danger` (red title) but not `errorText` or validation language.

### 3.4 Missing read-only state

Per Design.md "Form field micro spec": "Read-only fields: no border, `colors.textMuted` text, small lock or info icon — must not look like a disabled input."

**No component in the codebase implements a read-only state.** `AppInput` has `editable` (true/false) which maps to disabled (0.6 opacity). `PremiumTextField` and `PremiumInputShell` similarly conflate read-only with disabled. There is no way to show "this field has a value you can see but cannot edit" without making it look disabled (greyed out, low opacity). This is a systemic gap.

### 3.5 Inconsistent placeholder colour

All components use `colors.textMuted` for placeholder text, which is correct per Design.md. However, `AppSearchBar` (`AppSearchBar.tsx:54`) hardcodes `colors.textMuted` without the `??` fallback that the other components use. This is minor but means a consumer cannot override the placeholder colour on the search bar, while they can on `AppInput` and `PremiumTextField`.

### 3.6 Inline screen-level TextInput — 20+ raw instances

The grep across `frontend/src/screens` found **20+ screens using raw `TextInput`** instead of any shared component. Examples:

- `VerificationScreen.tsx`: 6 raw `TextInput` instances (lines 401, 412, 423, 435, 447, 713)
- `AIPoweredListingScreen.tsx`: 6 raw `TextInput` instances (lines 558, 574, 619, 662, 747)
- `SellScreen.tsx`: 7 raw `keyboardType="decimal-pad"` inputs
- `EditProfileScreen.tsx`: 1 raw `TextInput` inside `ProfileEditField` (line 327) — a fourth inline input system
- `AddBankAccountScreen.tsx`, `BuyoutScreen.tsx`, `BulkListingScreen.tsx`, `CreateSyndicateScreen.tsx`, `KYCVerificationScreen.tsx`, `TwoFactorSetupScreen.tsx`, `CoOwnRecurringOrdersScreen.tsx`, `AssetDetailScreen.tsx`, `WriteReviewScreen.tsx`, `SellerFulfilmentScreen.tsx`, `AccountControlScreen.tsx`, `VerificationResponseScreen.tsx`, `CreateLookScreen.tsx`, `AIAgentIntegrationScreen.tsx`, `InventoryManagementScreen.tsx`, `MyOrdersScreen.tsx`, `BuyerProtectionScreen.tsx`, `ConversationalSearchScreen.tsx` — all use raw `TextInput`

Each raw `TextInput` has its own inline styling, its own border logic, its own focus handling. This is the root cause of the inconsistent input geometry across the app. **The shared components exist but are not adopted.**

### 3.7 Segment control stroke grammar violation

`AppSegmentControl` (`AppSegmentControl.tsx:142`) uses `StyleSheet.hairlineWidth` (0.5pt) for its container border. Per AGENTS.md §4: "Never mix arbitrary 0.5, 1, 1.5 and 2pt outlines in the same component family." The segment control is an input-family component; its border should be `Stroke.standard` (1pt) or no border at all (filled container). The 0.5pt hairline is a separator stroke, not a field stroke.

### 3.8 Form section composition gaps

`FlagshipFormSection` (`FlagshipFormSection.tsx`) is well-architected with its variant system (flat/grouped/state/critical). However:
- The `state` variant uses `borderLeftWidth: 3` (line 137) — a 3pt left accent. This is not in the `Stroke` token system (`hairline: 0.5, standard: 1, emphasis: 2`). A 3pt stroke is an arbitrary value that violates the stroke grammar.
- The `critical` variant appends `'14'` to colour hex values (line 98-100: `colors.warning + '14'`) to create ~8% opacity tints. This is fragile string concatenation, not a token. If a colour value is ever shortened or changed, the concatenation breaks silently.
- There is no `FormSection` → `FormField` composition contract. Sections wrap children generically; there is no enforced spacing between fields, no label-field rhythm, no group-level validation summary.

---

## 4. Micro Improvements

### 4.1 Standardise min-height to 52pt

All single-line text inputs should be **52pt** min-height, matching Design.md "form-field" component spec (`height: 52px`) and the `ProfileEditField` inline implementation. `AppInput` (48pt) and `PremiumInputShell` (54pt) should both move to 52pt. Multiline bio fields should be **104pt** (matching `ProfileEditField`'s `fieldSurfaceMultiline.minHeight: 104`).

### 4.2 Standardise disabled opacity to 0.4

Per Design.md "Settings row micro spec": "Disabled rows: 0.4 opacity on entire row." The same applies to fields. `AppInput` (0.6), `PremiumTextField` (0.55), `PremiumInputShell` (0.55), and `PremiumSelectRow` (0.5) should all use **0.4** opacity on the entire field group (label + input + helper).

### 4.3 Standardise background to `colors.input`

All editable text fields should use `colors.input` (white in light, `#1A1A1A` in dark) as the background. `PremiumTextField` and `PremiumInputShell` currently use `colors.surfaceAlt` (grey), which Design.md explicitly prohibits: "never `colors.surface` (looks disabled)."

### 4.4 Fix `AppSearchBar` focus stroke

`AppSearchBar.tsx:94` should change from `Stroke.standard` (1pt) to `Stroke.emphasis` (2pt) on focus, and the focus border colour should change from `colors.textSecondary` to `colors.brand` to match the rest of the input family.

### 4.5 Fix `AppSegmentControl` stroke

`AppSegmentControl.tsx:142` should change from `StyleSheet.hairlineWidth` to `Stroke.standard` (1pt), or remove the border entirely and rely on the `surfaceAlt` fill for containment.

### 4.6 Fix `FlagshipFormSection` state variant stroke

`FlagshipFormSection.tsx:137` `borderLeftWidth: 3` should become `Stroke.emphasis` (2pt) or a new `Stroke.accent` token (3pt) added to `designTokens.ts`. The 3pt value should not be hardcoded.

### 4.7 Add label colour shift on focus to all inputs

`PremiumTextField` and `ProfileEditField` already shift label colour to `colors.brand` on focus. `AppInput` and `PremiumInputShell` do not. This should be standardised — label colour shift is the second signal in the three-signal focus language.

### 4.8 Add background tint shift on focus

No component currently shifts the background tint on focus. The 2026 best practice (Pravin Kumar) is a slight background lift to the lightest brand tone on focus. For ThryftVerse's neutral palette, this would be `colors.surface` (slightly lighter than `colors.input` in some themes) or a subtle `brand + '08'` tint. This is the third focus signal.

---

## 5. Macro Improvements — One-Input-System Architecture

### 5.1 Consolidate to a single `FlagshipTextField`

The three shared components (`AppInput`, `PremiumTextField`, `PremiumInputShell`) plus the inline `ProfileEditField` pattern should be consolidated into **one canonical input component**: `FlagshipTextField`. This component should support:

- **Appearance variants:** `filled` (default, `colors.input` background, 1pt border), `outline` (transparent background, 1pt border), `underline` (bottom border only, 1pt→2pt on focus).
- **State variants:** `default`, `focus`, `error`, `disabled`, `readOnly`.
- **Features:** label (top-aligned, persistent), helper text (below field), error text (below field, replaces helper), prefix/suffix slots, left icon, right action, character counter, multiline, `keyboardType`, `returnKeyType`, `autoCapitalize`, `autoComplete` (React Native `textContentType` for autofill), `selectionColor`.

**Migration path:** Do not delete `AppInput`, `PremiumTextField`, `PremiumInputShell` in one pass. Instead:
1. Build `FlagshipTextField` with the full contract.
2. Re-export `AppInput`, `PremiumTextField`, `PremiumInputShell` as thin wrappers around `FlagshipTextField` with appearance presets.
3. Migrate screens one by one, replacing raw `TextInput` and inline patterns with `FlagshipTextField`.
4. Once all screens are migrated, remove the wrapper components.

### 5.2 Form field contract

Every field in a form must implement this contract:

```typescript
interface FormFieldContract {
  // States
  state: 'default' | 'focus' | 'error' | 'disabled' | 'readOnly';
  // Geometry
  minHeight: 52; // single-line; 104 for multiline bio
  borderRadius: Radius.lg; // 12pt
  // Stroke grammar
  defaultBorder: { width: Stroke.standard, color: colors.border };
  focusBorder: { width: Stroke.emphasis, color: colors.brand };
  errorBorder: { width: Stroke.emphasis, color: colors.danger };
  disabledBorder: { width: Stroke.standard, color: colors.borderSubtle };
  readOnlyBorder: { width: 0, color: 'transparent' };
  // Background
  defaultBg: colors.input;
  focusBg: colors.input; // or subtle brand tint
  errorBg: colors.input;
  disabledBg: colors.surfaceAlt;
  readOnlyBg: 'transparent';
  // Focus signals (minimum 2, target 3)
  focusSignals: ['borderWidth 1→2pt', 'borderColor → brand', 'labelColor → brand'];
  // Label
  labelPosition: 'top';
  labelTypography: Type.captionElevated;
  labelColor: { default: colors.textSecondary, focus: colors.brand, error: colors.danger };
  // Helper/Error
  helperTypography: Type.caption;
  helperColor: colors.textMuted;
  errorTypography: Type.caption;
  errorColor: colors.danger;
  // Placeholder
  placeholderColor: colors.textMuted;
  // Disabled
  disabledOpacity: 0.4; // on entire field group
}
```

### 5.3 Focus/error/disabled state language

| State | Border width | Border colour | Background | Label colour | Opacity | Extra |
|-------|-------------|---------------|------------|--------------|---------|-------|
| Default | 1pt (`Stroke.standard`) | `colors.border` | `colors.input` | `colors.textSecondary` | 1.0 | — |
| Focus | 2pt (`Stroke.emphasis`) | `colors.brand` | `colors.input` (or subtle tint) | `colors.brand` | 1.0 | Cursor visible, `selectionColor: colors.brand` |
| Error | 2pt (`Stroke.emphasis`) | `colors.danger` | `colors.input` | `colors.danger` | 1.0 | Error text below, replaces helper |
| Disabled | 1pt (`Stroke.standard`) | `colors.borderSubtle` | `colors.surfaceAlt` | `colors.textMuted` | 0.4 | Entire field group dimmed |
| Read-only | 0pt | — | `transparent` | `colors.textMuted` | 1.0 | Lock/info icon, text in `colors.textMuted` |

### 5.4 Keyboard handling

Per Design.md "Form field micro spec": "Keyboard must never cover the active field — use `KeyboardAwareScrollView`." Per Design.md "Native safe-area contract": "Keyboard transitions must keep the focused field/composer visible."

**Current state:** `EditProfileScreen` uses `KeyboardAwareScrollView` (line 271). Other screens with raw `TextInput` may or may not — this is unverified at scale. The `FlagshipTextField` component should not handle keyboard scrolling itself (that is the screen's responsibility), but it should expose `onFocus` and `onBlur` callbacks that the screen can use to trigger `KeyboardAwareScrollView`'s `scrollToFocusedInput`.

**`keyboardType` audit:** The grep found 48 `keyboardType` usages across screens. All use correct types (`decimal-pad` for prices, `number-pad` for quantities, `email-address` for auth, `phone-pad` for phone, `url` for websites, `numeric` for IDs). This is a strength — the pattern should be preserved in the `FlagshipTextField` migration.

### 5.5 Form section composition

`FlagshipFormSection` should be paired with a `FlagshipFormFieldGroup` component that enforces:
- **Field spacing:** `Space.md` (16pt) between fields, `Space.lg` (24pt) between sections.
- **Label-field rhythm:** Label `Space.xs + 2` (6pt) above field, helper/error `Space.xs + 2` (6pt) below field.
- **Group-level validation:** An optional `errorSummary` prop that shows a list of field errors at the top of the group, with tap-to-focus on each error.
- **Section header:** `Type.metaElevated` (11pt semibold, `colors.textMuted`, uppercase, `letterSpacing: 0.3`) — matching `FlagshipFormSection.sectionTitle`.

### 5.6 Segment control upgrade

`AppSegmentControl` should add:
- **Disabled state:** 0.4 opacity on the entire control, no press feedback.
- **Error state:** 2pt `colors.danger` border on the container, error text below.
- **Spring config:** Already uses `withSpring(layout.x, spring.tap)` — this is correct per AGENTS.md §27.3.
- **Max options:** Enforce 2–5 options at the type level. 6+ should use a dropdown (`PremiumSelectRow`).

---

## 6. Flagship Acceptance Criteria

### 6.1 Stroke grammar

Per AGENTS.md §4: "Separators are hairline; fields and explicit outlines are 1pt; 2pt is reserved for focus or selection. Never mix arbitrary 0.5, 1, 1.5 and 2pt outlines in the same component family."

- ✅ Default field border: `Stroke.standard` (1pt)
- ✅ Focus field border: `Stroke.emphasis` (2pt)
- ✅ Error field border: `Stroke.emphasis` (2pt)
- ✅ Separator: `StyleSheet.hairlineWidth` (0.5pt)
- ❌ No 1.5pt, 3pt, or arbitrary stroke widths in any input-family component
- ❌ No 0pt-at-rest borders on filled inputs (must have 1pt at rest)

### 6.2 State coverage

Every input-family component must implement all five states:

| State | Required | Current coverage |
|-------|----------|-----------------|
| Default | ✅ all | ✅ all |
| Focus | ✅ all | ⚠️ inconsistent (see §3.2) |
| Error | ✅ all | ❌ `AppSearchBar`, `AppSegmentControl`, `FlagshipNavigationRow` missing |
| Disabled | ✅ all | ⚠️ inconsistent opacity (0.4/0.5/0.55/0.6) |
| Read-only | ✅ text inputs | ❌ no component implements this |

### 6.3 Focus signal minimum

Every text input must have **at least two** of these three focus signals:
1. Border width 1pt→2pt + border colour → `colors.brand`
2. Label colour → `colors.brand`
3. Background tint shift (subtle)

### 6.4 Touch target

Every input and input-adjacent control must have a **44pt minimum touch target** (`Control.hit`). This includes: text fields (52pt height ≥ 44pt ✅), search bars (`AppSearchBar.tsx:91` uses `Control.hit` ✅), select rows (`PremiumSelectRow.tsx:112` uses 52pt ✅), segment options (`AppSegmentControl.tsx:152` uses 44pt ✅), navigation rows (`FlagshipNavigationRow.tsx:82` uses `Control.hit` ✅).

### 6.5 Accessibility

Per AGENTS.md §18 and WCAG 2.2:
- Every input has `accessibilityLabel` (field label).
- Every input has `accessibilityRole="search"` (search bar) or no explicit role (text input defaults to "text" in RN).
- Error text is linked to the field via `accessibilityLiveRegion="assertive"` or `accessibilityLabel` concatenation.
- `aria-invalid` equivalent: React Native does not have `aria-invalid`, but `accessibilityState={{ invalid: true }}` is not supported either. Use `accessibilityLabel` prefix: "Error: {label}".
- Placeholder is not the label — persistent label above the field.
- Contrast: `colors.textMuted` is WCAG 2.2 AA verified (4.65:1 light / 4.64:1 dark per Design.md).

---

## 7. Priority & Sequencing

### Phase 1 — Foundation (highest impact, lowest risk)
1. **Build `FlagshipTextField`** with the full form field contract (§5.2). This is the one-input-system.
2. **Fix `AppSearchBar` focus stroke** to `Stroke.emphasis` (2pt) + `colors.brand` (§4.4).
3. **Fix `AppSegmentControl` stroke** to `Stroke.standard` (§4.5).
4. **Add disabled/error states** to `AppSegmentControl` and `AppSearchBar`.

### Phase 2 — Standardisation (medium risk, systemic)
5. **Re-export `AppInput`, `PremiumTextField`, `PremiumInputShell`** as wrappers around `FlagshipTextField`.
6. **Standardise disabled opacity** to 0.4 across all input components.
7. **Standardise background** to `colors.input` across all input components.
8. **Standardise min-height** to 52pt across all input components.
9. **Add read-only state** to `FlagshipTextField`.

### Phase 3 — Screen migration (high effort, proportional)
10. **Migrate `EditProfileScreen`** `ProfileEditField` to `FlagshipTextField` (remove the fourth inline system).
11. **Migrate `VerificationScreen`** 6 raw `TextInput` to `FlagshipTextField`.
12. **Migrate `AIPoweredListingScreen`** 6 raw `TextInput` to `FlagshipTextField`.
13. **Migrate `SellScreen`** 7 raw `TextInput` to `FlagshipTextField`.
14. **Migrate remaining 15+ screens** with raw `TextInput` to `FlagshipTextField`, one screen per commit.

### Phase 4 — Composition (polish)
15. **Build `FlagshipFormFieldGroup`** with enforced spacing and group-level validation summary.
16. **Fix `FlagshipFormSection` state variant** 3pt stroke to token (§4.6).
17. **Fix `FlagshipFormSection` critical variant** hex concatenation to use a proper tint token.
18. **Add three-signal focus** (border + label + tint) to `FlagshipTextField`.

---

## 8. Token-Level Spec Table

### 8.1 Text Input (`FlagshipTextField` / `AppInput` / `PremiumTextField` / `PremiumInputShell`)

| Token | Value | Source |
|-------|-------|--------|
| min-height (single-line) | 52pt | Design.md `form-field.height: 52px`; `EditProfileScreen.tsx:469` |
| min-height (multiline bio) | 104pt | `EditProfileScreen.tsx:485` |
| border-radius | `Radius.lg` (12pt) | Design.md `form-field.rounded: rounded.xl` (16pt in YAML, but `Radius.lg` 12pt is the verified runtime value used by all current components) |
| default border-width | `Stroke.standard` (1pt) | `designTokens.ts:505` |
| focus border-width | `Stroke.emphasis` (2pt) | `designTokens.ts:507` |
| error border-width | `Stroke.emphasis` (2pt) | Design.md "Form field micro spec" |
| default border-color | `colors.border` | Design.md `colors.current-runtime.border` |
| focus border-color | `colors.brand` | Design.md; all current components |
| error border-color | `colors.danger` | Design.md; all current components |
| background (default/focus/error) | `colors.input` | Design.md `form-field.backgroundColor: colors.input` |
| background (disabled) | `colors.surfaceAlt` | — |
| background (read-only) | `transparent` | Design.md "Form field micro spec" |
| disabled opacity | 0.4 | Design.md "Settings row micro spec" |
| label typography | `Type.captionElevated` (13/18) | Design.md "Form field micro spec" |
| label color (default) | `colors.textSecondary` | All current components |
| label color (focus) | `colors.brand` | `PremiumTextField.tsx:192`; `EditProfileScreen` |
| label color (error) | `colors.danger` | `PremiumTextField.tsx:195` |
| label margin-bottom | `Space.sm` (8pt) | `PremiumTextField.tsx:189`; Design.md |
| input typography | `Type.bodyEmphasis` (15/21/500) | `AppInput.tsx:164`; `PremiumTextField.tsx:213` |
| input color | `colors.textPrimary` | All current components |
| placeholder color | `colors.textMuted` | Design.md; all current components |
| helper typography | `Type.caption` (12/16) | `PremiumTextField.tsx:228` |
| helper color | `colors.textMuted` | All current components |
| error typography | `Type.caption` (12/16) semibold | `PremiumTextField.tsx:234` |
| error color | `colors.danger` | All current components |
| helper/error margin-top | `Space.sm` (8pt) | `PremiumTextField.tsx:227` |
| padding-horizontal | `Space.md` (16pt) | `PremiumTextField.tsx:201`; `EditProfileScreen.tsx:468` |
| selection color | `colors.brand` | `EditProfileScreen.tsx:341` |
| left icon size | `Control.iconCompact` (18pt) | `PremiumTextField.tsx:142` |
| left icon color (default) | `colors.textMuted` | `PremiumTextField.tsx:143` |
| left icon color (focus) | `colors.brand` | `PremiumTextField.tsx:143` |
| left icon color (error) | `colors.danger` | `PremiumTextField.tsx:143` |

### 8.2 Search Bar (`AppSearchBar`)

| Token | Value | Source |
|-------|-------|--------|
| min-height | `Control.hit` (44pt) | `AppSearchBar.tsx:91` |
| border-radius | `Radius.lg` (12pt) | `AppSearchBar.tsx:85` |
| default border-width | 0 | `AppSearchBar.tsx:86` |
| focus border-width | **`Stroke.emphasis` (2pt)** ← fix from `Stroke.standard` | `AppSearchBar.tsx:94` (current: wrong) |
| default border-color | `transparent` | `AppSearchBar.tsx:87` |
| focus border-color | **`colors.brand`** ← fix from `colors.textSecondary` | `AppSearchBar.tsx:95` (current: wrong) |
| background | `colors.surface` | `AppSearchBar.tsx:84` |
| search icon size | `Control.iconCompact` (18pt) | `AppSearchBar.tsx:48` |
| search icon color (default) | `colors.textMuted` | `AppSearchBar.tsx:48` |
| search icon color (focus) | `colors.textSecondary` | `AppSearchBar.tsx:48` |
| clear icon size | `Control.iconCompact` (18pt) | `AppSearchBar.tsx:71` |
| input typography | `Type.body` (14/20/400) | `AppSearchBar.tsx:99` |
| placeholder color | `colors.textMuted` | `AppSearchBar.tsx:54` |
| padding-horizontal | `Space.md` (16pt) | `AppSearchBar.tsx:88` |
| padding-vertical | `Space.sm` (8pt) | `AppSearchBar.tsx:89` |
| gap | `Space.sm` (8pt) | `AppSearchBar.tsx:90` |

### 8.3 Select Row (`PremiumSelectRow`)

| Token | Value | Source |
|-------|-------|--------|
| min-height | 52pt | `PremiumSelectRow.tsx:112` |
| border-radius | `Radius.lg` (12pt) | `PremiumSelectRow.tsx:108` |
| border-width | `Stroke.standard` (1pt) | `PremiumSelectRow.tsx:109` (currently hardcoded `1`, should use token) |
| border-color (default) | `colors.border` | `PremiumSelectRow.tsx:35-37` |
| border-color (error) | `colors.danger` | `PremiumSelectRow.tsx:35-37` |
| background | `colors.surfaceAlt` | `PremiumSelectRow.tsx:110` ← should be `colors.input` per Design.md |
| disabled opacity | 0.5 ← fix to 0.4 | `PremiumSelectRow.tsx:116` |
| label typography | `Type.captionElevated` (13/18) | `PremiumSelectRow.tsx:96` |
| value typography | `Type.bodyEmphasis` (15/21/500) | `PremiumSelectRow.tsx:123` |
| placeholder color | `colors.textMuted` | `PremiumSelectRow.tsx:128` |
| chevron size | 16pt | `PremiumSelectRow.tsx:77` |
| chevron color (default) | `colors.textMuted` | `PremiumSelectRow.tsx:78` |
| chevron color (disabled) | `colors.border` | `PremiumSelectRow.tsx:78` |
| icon size | `Control.iconCompact` (18pt) | `PremiumSelectRow.tsx:59` |
| padding-horizontal | `Space.md` (16pt) | `PremiumSelectRow.tsx:111` |
| gap | `Space.sm` (8pt) | `PremiumSelectRow.tsx:113` |

### 8.4 Segment Control (`AppSegmentControl`)

| Token | Value | Source |
|-------|-------|--------|
| container border-radius | `Radius.md` (8pt) | `AppSegmentControl.tsx:141` |
| container border-width | **`Stroke.standard` (1pt)** ← fix from `hairlineWidth` | `AppSegmentControl.tsx:142` (current: wrong) |
| container border-color | `colors.border` | `AppSegmentControl.tsx:67` |
| container background | `colors.surfaceAlt` | `AppSegmentControl.tsx:67` |
| indicator border-radius | `Radius.sm` (4pt) | `AppSegmentControl.tsx:149` |
| indicator background | `colors.surface` | `AppSegmentControl.tsx:75` |
| option min-height | `Control.hit` (44pt) | `AppSegmentControl.tsx:152` |
| option border-radius | `Radius.sm` (4pt) | `AppSegmentControl.tsx:153` |
| option padding-horizontal | `Space.md` (16pt) | `AppSegmentControl.tsx:154` |
| option padding-vertical | `Space.xs` (4pt) | `AppSegmentControl.tsx:155` |
| option gap | `Space.xs` (4pt) | `AppSegmentControl.tsx:159` |
| text typography | `Type.captionElevated` (13/18) semibold | `AppSegmentControl.tsx:165-167` |
| text color (inactive) | `colors.textSecondary` | `AppSegmentControl.tsx:121` |
| text color (active) | `colors.textPrimary` | `AppSegmentControl.tsx:122` |
| container padding | 3pt | `AppSegmentControl.tsx:140` |
| container gap | 2pt | `AppSegmentControl.tsx:139` |
| spring config | `spring.tap` (damping 18, stiffness 280, mass 0.8) | `AppSegmentControl.tsx:53`; AGENTS.md §27.3 |
| haptic | `selection` (on change only) | `AppSegmentControl.tsx:111` |
| **missing: disabled state** | 0.4 opacity on container, no press | — |
| **missing: error state** | 2pt `colors.danger` container border, error text below | — |

### 8.5 Form Section (`FlagshipFormSection`)

| Token | Value | Source |
|-------|-------|--------|
| wrapper margin-bottom | `Space.lg` (24pt) | `FlagshipFormSection.tsx:107` |
| section title typography | `Type.metaElevated` (11/14) semibold | `FlagshipFormSection.tsx:110-111` |
| section title color | `colors.textMuted` | `FlagshipFormSection.tsx:76` |
| section title letter-spacing | 0.3 | `FlagshipFormSection.tsx:112` |
| section title margin-bottom | `Space.sm` (8pt) | `FlagshipFormSection.tsx:113` |
| section title margin-left | `Space.xs` (4pt) | `FlagshipFormSection.tsx:114` |
| description typography | `Type.caption` (12/16) regular | `FlagshipFormSection.tsx:118-119` |
| description color | `colors.textSecondary` | `FlagshipFormSection.tsx:79` |
| description margin-bottom | `Space.smMd` (12pt) | `FlagshipFormSection.tsx:120` |
| flat variant | no border, no background | `FlagshipFormSection.tsx:125` |
| grouped variant | `colors.surfaceAlt` bg, `Radius.lg` (12pt), `Space.md`/`Space.sm` padding | `FlagshipFormSection.tsx:128-133` |
| state variant | `colors.surfaceAlt` bg, **`borderLeftWidth: 3`** ← fix to `Stroke.emphasis` (2pt) or new token | `FlagshipFormSection.tsx:137` (current: arbitrary 3pt) |
| critical variant | tinted bg (`color + '14'` hex concat) ← fix to proper tint token | `FlagshipFormSection.tsx:141-146` |
| critical/grouped/state border-radius | `Radius.lg` (12pt) | `FlagshipFormSection.tsx:129,135,142` |
| critical/grouped/state padding | `Space.md` / `Space.sm` | `FlagshipFormSection.tsx:131-132,138-139,144-145` |

### 8.6 Navigation Row (`FlagshipNavigationRow`)

| Token | Value | Source |
|-------|-------|--------|
| min-height | `Control.hit` (44pt) | `FlagshipNavigationRow.tsx:82` |
| padding-vertical | `Space.sm + Space.xs` (12pt) | `FlagshipNavigationRow.tsx:177` |
| padding-horizontal | `Space.md` (16pt) | `FlagshipNavigationRow.tsx:178` |
| content-row min-height | `Control.hit` (44pt) | `FlagshipNavigationRow.tsx:185` |
| content-row gap | `Space.sm` (8pt) | `FlagshipNavigationRow.tsx:184` |
| title typography | `Type.bodyEmphasis` (15/21/600) | `FlagshipNavigationRow.tsx:199-202` |
| title color (default) | `colors.textPrimary` | `FlagshipNavigationRow.tsx:94` |
| title color (disabled) | `colors.textMuted` | `FlagshipNavigationRow.tsx:91` |
| title color (danger) | `colors.danger` | `FlagshipNavigationRow.tsx:93` |
| subtitle typography | `Type.captionElevated` (13/18/400) | `FlagshipNavigationRow.tsx:205-208` |
| subtitle color | `colors.textMuted` | `FlagshipNavigationRow.tsx:122` |
| icon size | `Control.iconCompact` (18pt) | `FlagshipNavigationRow.tsx:107` |
| icon color (default) | `colors.textSecondary` | `FlagshipNavigationRow.tsx:108` |
| icon color (danger) | `colors.danger` | `FlagshipNavigationRow.tsx:108` |
| chevron size | 16pt | `FlagshipNavigationRow.tsx:134` |
| chevron color | `colors.textMuted` | `FlagshipNavigationRow.tsx:134` |
| separator height | `StyleSheet.hairlineWidth` (0.5pt) | `FlagshipNavigationRow.tsx:220` |
| separator color | `colors.border` | `FlagshipNavigationRow.tsx:145` |
| separator inset | `Space.md + leadingWidth + Space.sm` | `FlagshipNavigationRow.tsx:146` |
| press scale | 0.98 | `FlagshipNavigationRow.tsx:161` |
| press active opacity | 0.6 | `FlagshipNavigationRow.tsx:162` |
| press haptic | `light` | `FlagshipNavigationRow.tsx:163` |
| **missing: error state** | No `errorText` or validation language | — |
| **missing: disabled opacity** | Uses `colors.textMuted` for title only, no row-level opacity | Should be 0.4 on entire row per Design.md |

---

## 9. Web Research Citations

1. **Form UX Design: 12 Rules to Cut Abandonment by Half (2026)** — https://heurilens.com/blog/interaction-flow/form-ux-design-rules-reduce-abandonment — Mobile form abandonment 25-30% higher than desktop; correct `keyboardType` reduces errors by 36%; 44px minimum touch targets (Apple HIG) / 48px (Material).

2. **Designing for the Thumb: 9 Tips for Mobile-Friendly Forms in 2026** — https://antforms.com/blog/designing-for-the-thumb-9-tips-for-mobile-friendly-forms/ — Thumb-zone CTA placement (bottom third); 48px+ tap targets; one question per screen; 73% of digital interactions on mobile.

3. **The Complete Guide to Form Design in 2026** — https://timgraf.com/ui/the-complete-guide-to-form-design-in-2026-how-to-build-data-collection-interfaces-that-users-actually-complete/ — Top-aligned labels outperform left-aligned by up to 50% on mobile (NNG 2018, replicated); input width should match expected input length (Google: 8% error reduction, 12% time reduction); autofill reduces completion time 30%, errors 40% (Baymard 2021).

4. **How Should Form Inputs Look on a Webflow Site in 2026?** — https://www.pravinkumar.co/blog/webflow-form-input-design-2026 — 2026 focus state: 2pt outer ring + darker border + background tint shift (three stacked signals); 16px font minimum (iOS Safari zoom); 62% of form submissions on mobile in 2026 (Webflow analytics).

5. **Everything You Need to Know About Text Field Design (2026)** — https://lollypop.design/blog/2026/january/text-field-design/ — Persistent labels above fields; visible borders; consistent field shapes; autocomplete and auto-suggest; voice input for hands-free.

6. **Text Field — CMS Design System** — https://design.cms.gov/components/text-field/text-field/ — Focus indicators must be clearly visible; screen readers must announce labels; mobile portrait and landscape support.

7. **Mobile checkout UI: Best practices for businesses | Stripe** — https://stripe.com/resources/more/mobile-checkout-ui — 44px minimum targets; single-column layout; labels outside fields; primary buttons in thumb zone (bottom).

8. **Form UX best practices: what the research actually says** — https://fomr.io/blog/form-ux-best-practices — Top-aligned labels fastest (Wroblewski eye-tracking, NNG replication); input sizing hints at expected length (Baymard); tab order follows visual order.

9. **Accessible form design: a practical guide** — https://fomr.io/blog/accessible-form-design — WCAG 1.3.1 (info and relationships), 1.4.3 (contrast 4.5:1), 2.1.1 (keyboard), 2.4.7 (focus visible), 3.3.1 (error identification), 3.3.2 (labels).

10. **Make it Easy to Undo Form Errors | WAI W3C** — https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p05-form-undo/ — Cognitive accessibility: allow users to check work and correct mistakes; easy return to previous state; essential for cognitive/learning disabilities.

11. **Accessible Error Messages in Forms: WCAG 3.3 Guide** — https://accessalyze.com/blog/accessible-error-messages-forms.html — Errors must identify field, describe problem, suggest fix; `aria-describedby` to link error to field; `aria-invalid="true"`; error summary for multi-field forms.

12. **Error messages and correction — BBC Accessibility** — https://www.bbc.co.uk/accessibility/forproducts/guides/mobile/error-messages-and-correction — Inline error messages; `aria-invalid`; avoid keyboard traps; move focus to first error field on submit.

13. **Segmented Control UI: Best Practices + Real Examples** — https://www.eleken.co/blog-posts/segmented-control-ui — 2–5 options (text), up to 6 (icon-only); 44pt iOS / 48pt Android targets; immediate effect; not for navigation.

14. **Design | Segmented control | Supernova** — https://helix.supernova-docs.io/latest/components/segmented-control/design-7sQgNtA2 — Max 4 segments on native; equal width; checkmark icon for extra visual cues on Android; 44×44pt iOS / 48×48pt Android targets; text resizes to 200%.

15. **Android UX vs iOS UX Differences: 2026 Designer Guide** — https://www.sanjaydey.com/android-ux-vs-ios-ux-differences/ — Android 70.4% / iOS 29.3% global share 2026; iOS 64% of consumer spend; Material 3 Segmented Buttons vs iOS Segmented Controls; 44pt iOS / 48dp Android tap targets.

16. **Ecommerce Form Design: Labels, Inputs & Validation (2026)** — https://ecomhint.com/blog/ecommerce-form-design — 54% of ecommerce sites fail to invoke correct mobile keyboard (Baymard); `autocomplete` attributes for autofill; inline validation timing.

17. **Form design: 9 rules backed by UX research (2026)** — https://kirro.io/form-design — Top-aligned labels (Penzo eye-tracking, ACM); field size matches expected input; inline validation on blur (+10% success, -42% time per Wroblewski); progressive disclosure; group related fields.

18. **USWDS Form Accessibility** — https://designsystem.digital.gov/components/form/ — Don't control element order with CSS; align validation with inputs; fieldset/legend for grouped controls; simple vertical layouts; `aria-labelledby` for iOS VoiceOver fieldset support.

---

## 10. Summary

The ThryftVerse input/form system has **three duplicate shared components, one inline screen-level pattern, and 20+ screens with raw `TextInput`** — all producing inconsistent geometry (48/52/54pt heights), inconsistent disabled states (0.4/0.5/0.55/0.6 opacity), inconsistent stroke grammars (0pt/1pt/2pt at rest), and incomplete state coverage (no read-only, missing error states on search/segment, single-signal focus).

The flagship upgrade path is:
1. **One input system** (`FlagshipTextField`) with a five-state contract (default/focus/error/disabled/read-only).
2. **One stroke grammar** (1pt default, 2pt focus/error, 0.5pt separators only).
3. **One focus language** (minimum two signals: border 1→2pt + label colour shift; target three: + background tint).
4. **One disabled language** (0.4 opacity on entire field group).
5. **One background token** (`colors.input`, never `colors.surface` or `colors.surfaceAlt` for editable fields).
6. **Screen-by-screen migration** of all 20+ raw `TextInput` instances to the canonical component.
7. **Form section composition** with enforced field spacing and group-level validation summary.

The improvement must be obvious at thumbnail size: consistent field heights, consistent focus rings, consistent disabled dimming, and no grey blocks that look disabled but are actually editable.
