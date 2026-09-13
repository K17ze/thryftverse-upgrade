# Task 5 — Design.md stale/contradictory assertion fix (F01)

**Date:** 2026-09-11
**Scope:** `Design.md` (documentation only — no code changed)
**Status:** DONE

## Verification performed (all against source)

| Claim in Design.md | Source-checked result |
|---|---|
| `benchmark-date: 2026-09-22` | Future-dated vs. assessment date 2026-09-11. Corrected. |
| "ThemeContext.tsx … does not yet expose the proposed premium/luxury tokens" | **Stale.** `frontend/src/theme/ThemeContext.tsx` lines 74–83 expose `bronzeSubtle`, `antiqueGold`, `bronze` — all marked `@deprecated`. Semantic accents `coownUp`, `coownDown`, `social`, `discovery`, `commerceTrust` (+Subtle/Border) are live (ThemeContext.tsx lines 55–83; values in `frontend/src/constants/colors.ts`). |
| "designTokens.ts is the runtime source of truth" (incl. typography) | **Imprecise.** `typography.v2.ts` header declares itself the single source of truth for type roles; `designTokens.ts` `Type`/`TypeStyles` are compatibility exports. |
| `display` role geometry | **Confirmed divergence.** `designTokens.ts` `Type.display` = 24/30 (line 109); `typography.v2.ts` `TypographyV2.display` = 32/38 (lines 88–95). `TypeStyles.display` delegates to `TypographyV2` (32/38). Design.md front matter + type scale already specify 32/38 — TypographyV2 is canonical. |
| `useGradients()` at gradients.ts:85 | **Stale line ref.** Hook is at line 96. |

## Changes made to Design.md

1. **Line 4** — `benchmark-date: "2026-09-22"` → `"2026-09-11"` (actual access date).
2. **Lines 7–13 (`implementation-status`)** — rewrote the block:
   - `current-runtime-theme`: now states semantic accents are implemented; `antiqueGold`/`bronze`/`bronzeSubtle` are exposed but `@deprecated` for new use; remaining proposed-luxury keys (`champagne`, `luxuryOnAccent`, `luxuryFocus*`, `softGoldSurface*`, `goldBorder*`, `goldGlow*`, pressed variants) are not implemented. Relabeled `VERIFIED` → `SOURCE-VERIFIED 2026-09-11`.
   - `current-spacing-type-radius-motion`: scoped designTokens.ts authority to Space/Radius/motion; typography deferred to new key.
   - Added `typography-authority` key documenting TypographyV2 as canonical and the 24-vs-32 `display` migration gap.
   - `current-gradients`: fixed stale line ref 85 → 96.
   - `target-premium-tokens`: added that existing deprecated gold consumers are legacy and must not be extended.
3. **New `## Evidence status` section (lines 252–263)** — added directly after the YAML front matter. States the document describes policy/direction, that visual-quality claims require rendered evidence, and defines the vocabulary: `implemented`, `statically verified`/`source-verified`, `native reviewed`, `live verified`. Explicit rule: source-verified artifacts must not be described as "flagship"/"production-ready"/visually accepted.
4. **Benchmark freshness (line 291)** — "available on 30 August 2026" → "accessed as of the benchmark date, 11 September 2026" (removes doc-internal date contradiction).
5. **Colors → Current runtime palette (line 330)** — replaced "does **not** currently expose the proposed premium/luxury keys" with the accurate split (implemented semantics, deprecated gold trio, unimplemented remainder).
6. **Colour hierarchy (lines ~368–370)** — `commerceTrust`, `social`/`discovery`, `coownUp`/`coownDown` relabeled from "proposed" to "(implemented)".
7. **Luxury Accent System → Implementation status (line 407)** — corrected: most keys remain proposed; `antiqueGold`/`bronze`/`bronzeSubtle` are exposed but `@deprecated`; migration checklist now applies to remaining keys only.
8. **Typography section (lines 454–456)** — canonical source corrected to `typography.v2.ts`; added a "Known migration gap" note documenting `Type.display` 24/30 vs `TypographyV2.display` 32/38, with 32/38 canonical. Line 459 updated to route new code through `TypographyV2`/`typographyV2Style` instead of deprecated `Type`/`TypeStyles`.
9. **YAML comments** — annotated `proposed-luxury` (partially implemented, deprecated trio) and `proposed-semantic` (implemented, theme-adapted values) blocks without renaming keys, preserving the machine-readable contract.
10. **Qualified "verified" overclaims** — "verified static exports" → "implemented static exports" (gradients rules, lines ~377 and ~1860); "verified `Space` scale" → "the `Space` scale implemented in designTokens.ts".

## What was deliberately NOT changed

- Design policy content (palette values, component specs, motion/geometry rules, defect severity ladder, report format) — untouched.
- `proposed-*` YAML key names — kept for machine-readability; annotated with comments instead.
- "30 August 2026" section headers at lines 1306 and 2670 — these are historical evidence-contract dates, not the benchmark claim; left intact.
- Policy uses of "flagship quality"/"production-ready" that define the bar or forbid premature claims (e.g., P1 gate, scorecard rules, runtime-truth rule) — these are process language, not unverified quality assertions.
- Premium badge micro-spec "after token migration" gates — still correct policy given the deprecated status of the gold tokens.

## Issues / notes for parent agent

- The `display` divergence is a real code defect beyond docs: `Type.display` (24/30) in designTokens.ts contradicts `TypographyV2.display` (32/38) — and typography.v2.ts's own comment claims `Type` "already mirrors these roles," which is false for `display` (also `title`/`screenTitle`: Type=20/26 vs V2=24/32; `captionElevated` weight 400 vs 500; `label`/`metaElevated` differ in letterSpacing). A code-level alignment pass is recommended as a follow-up.
- Semantic accent runtime values differ from Design.md policy hexes by design (e.g., dark `coownUp` is `#8ED1A7` vs policy `#1C5631`, per colors.ts comments). Documented as "theme-adapted" in the YAML annotation.
