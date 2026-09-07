# Task 3B Brief — One icon family + tightened copy across the editor surfaces

Repo: C:\Users\User\Desktop\thryftverse-upgrade. React Native + Expo ~57, TS strict.

## Mission

The editor surfaces mix three icon systems side by side (Ionicons direct, AppGlyph
coolicons SVG, AppIcon semantic wrapper) and carry verbose onboarding copy. Consolidate
to ONE family and tighten copy. This is a consistency pass, not a redesign.

## Context (read first)

- frontend/src/theme/designTokens.ts ~459-472 — IconGrammar: one family, one optical
  size band, stable outline/filled rule. This is the law.
- frontend/src/components/AppIcon* (find the actual path) — the repo's semantic icon
  wrapper (Ionicons-based, color-token-aware). Check its API before using.
- Mixed usage today: Ionicons direct (CreatorAssetPicker.tsx ~898, CreatorCropSheet
  ~541), AppGlyph coolicons (CreatorAssetPicker ~843, ~1040), AppIcon (LUTBrowserSheet
  ~153, AIEffectGrid ~258).

## Implementation

### 1. Icon consolidation (these files only)
- frontend/src/creator/CreatorAssetPicker.tsx: replace AppGlyph usages with AppIcon
  equivalents (find the closest Ionicons name per glyph semantics; keep sizes within
  the file's existing bands). Where an AppGlyph has no faithful Ionicons equivalent,
  keep AppGlyph for THAT glyph and note it — do not force a bad match.
- frontend/src/creator/CreatorCropSheet.tsx: Ionicons direct → AppIcon wrapper
  (same glyphs, same sizes).
- Do NOT touch other files' icons (ListingMediaStudio is a parallel task).

### 2. Copy tightening (these files only)
- CreatorAssetPicker.tsx ~868 "Allow access to your photos to start creating." and
  ~1010 "Take photos with the camera to get started." — FIRST check whether these
  strings are i18n keys (t('...')) or literals. If i18n: edit the translation source
  (find the locale files; tighten the EN copy, leave other locales). If literals:
  tighten in place. Target copy (or better, matching the app's existing voice):
  - permission-denied title: "Allow photo access" / body: "ThryftVerse needs access to your library to add photos."  — keep it to ONE short sentence of necessity, no marketing.
  - camera empty: "Camera access needed" / "Enable the camera to capture items directly."
- CreatorCropSheet: verify no explanatory copy remains (Reset/Cancel/Done labels only).
- Do not touch screens or other surfaces' copy.

### 3. Consistency sweep (same files)
- One stroke width per layer: hairline separators Stroke.standard, emphasis
  Stroke.emphasis — replace arbitrary 0.5/1.5/2 hardcodes in these files.
- One press-feedback pattern per file (the repo's AnimatedPressable/PressScale where
  already imported; opacity-press otherwise). No layout-shifting press states.

## Constraints

- TS strict, no `any`, no new deps, no new icon families.
- Keep diffs tight: icon swaps + copy + stroke tokens. No restructuring.
- Accessibility labels unchanged in meaning; update wording only where the copy changed.

## Verification

1. npm run typecheck; scoped eslint; npm test (baseline 7 pre-existing unrelated).
2. Report: list every icon swap (from → to), every copy change, and any glyph you
   deliberately kept on AppGlyph with the reason.

## Report

Append to .flagship/sdd/task-3B-report.md; return ONLY status, one-line test summary, concerns.
