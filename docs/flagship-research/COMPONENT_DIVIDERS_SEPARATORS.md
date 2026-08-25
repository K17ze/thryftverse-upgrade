# ThryftVerse Flagship Upgrade — Dividers & Separators

**Component deep-dive:** every section divider, hairline separator, inset divider, and label divider in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 (stroke grammar: hairline for separators, 1pt for fields, 2pt for focus) · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram uses dividers sparingly — the feed has no visible dividers between posts (content separation is handled by whitespace and media boundaries). Settings lists use full-width hairlines between rows. Profile sections use no dividers — the tab rail and content scroll handle the separation. Instagram's lesson: **dividers are for grouping, not for every row — if whitespace or media boundaries already separate content, don't add a divider.**

### eBay (2026)
eBay's settings and checkout flows use inset dividers (left-aligned at 16pt, right-aligned to edge) between rows in grouped lists. The inset creates visual hierarchy — the divider doesn't span the full width, so it reads as "these rows are grouped" rather than "these rows are separate." eBay's lesson: **inset dividers communicate grouping; full-width dividers communicate separation.**

### Cross-cutting 2026 consensus
- **Hairline (0.5pt)** for separators — per AGENTS.md stroke grammar.
- **Full-width** for hard separation between sections.
- **Inset** (left padding) for grouped list rows.
- **Label dividers** ("OR", "Shipping address") for section headers within a list.
- **Color:** `colors.hairline` (subtle, not `colors.border` which is too strong).
- **No divider on every row** — use whitespace when content is self-separating.

---

## 2. Psychology & Principles

### Separation vs grouping
A full-width divider says "these are separate sections." An inset divider says "these are grouped items within a section." Using a full-width divider between every row in a settings group makes the group feel like a list of unrelated items. Using an inset divider makes the group feel cohesive — the items are related, the divider just helps the eye scan.

### The over-division problem
When every row has a divider, the dividers become visual noise — the user sees lines instead of content. The 2026 standard: use dividers only when whitespace doesn't adequately separate content. In a media feed, no dividers. In a settings list, inset dividers between rows. Between sections, full-width dividers or label dividers.

### Label dividers as section headers
A label divider ("Shipping Address", "Payment Method", "OR") combines a divider with a text label. It serves as both a separator and a section header. This is more space-efficient than a separate header + divider and is the standard pattern for grouped settings forms.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Divider/separator usage

| Metric | Count | Notes |
|--------|-------|-------|
| Files with `borderBottomWidth: StyleSheet.hairlineWidth` or `borderTopWidth` | ~674 matches | Heavy inline usage |
| Shared Divider component | **None** | No `components/ui/Divider.tsx` |
| Label divider component | **None** | No "OR" or section header divider |
| Inset divider pattern | Ad hoc | Some screens use marginLeft, others use paddingLeft |

### Inline hairline implementations
The codebase has **~674 matches** for `borderBottomWidth: StyleSheet.hairlineWidth` or `borderTopWidth: StyleSheet.hairlineWidth` or `Divider`/`Separator`/`Hairline` patterns. This is one of the most duplicated patterns in the app — every screen builds its own hairline with `View` + `borderBottomWidth`.

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No shared Divider component** — ~674 inline hairline implementations | Global | High |
| 2 | **Inconsistent hairline colors** — some use `colors.hairline`, some `colors.border`, some `colors.separator` | Multiple files | Medium |
| 3 | **No label divider component** — "OR" dividers built inline | Auth screens, checkout | Medium |
| 4 | **No inset divider pattern** — inconsistent left insets on grouped list dividers | Settings, checkout | Medium |
| 5 | **Over-division** — some screens put dividers on every row where whitespace would suffice | Multiple list screens | Low |
| 6 | **Inconsistent divider opacity** — some at 100%, some at 50%, some at 30% | Multiple files | Low |

---

## 4. Micro Improvements

### M1 — Create shared Divider component
```tsx
interface DividerProps {
  variant?: 'full' | 'inset' | 'label';
  inset?: number;          // left inset for 'inset' variant
  label?: string;          // text for 'label' variant
  color?: string;          // default colors.hairline
  thickness?: number;      // default StyleSheet.hairlineWidth
}
```
- `variant="full"` — full-width hairline
- `variant="inset"` — left-padded hairline (default inset: Space.md)
- `variant="label"` — hairline with centered text label ("OR", "Shipping Address")

### M2 — Standardize hairline color
Use `colors.hairline` (a subtle, low-contrast color) for all separators. Not `colors.border` (too strong), not `colors.separator` (inconsistent). Define `colors.hairline` in the theme as `colors.surfaceAlt` at 50% opacity or a dedicated hairline token.

### M3 — Create LabelDivider for "OR" and section headers
```tsx
<Divider variant="label" label="OR" />
<Divider variant="label" label="Shipping Address" />
```
Renders: thin line | label | thin line (centered label) or label above full-width line (section header style).

### M4 — Replace inline hairlines with Divider component
Migrate the ~674 inline `borderBottomWidth: StyleSheet.hairlineWidth` implementations to use `<Divider />`. This is a large refactor but eliminates one of the most duplicated patterns in the codebase.

### M5 — Audit and remove unnecessary dividers
In list screens where content is self-separating (media cards, feed items), remove dividers and rely on whitespace. Keep dividers only in settings lists, checkout forms, and grouped rows.

---

## 5. Macro Improvements

### A1 — Divider component system
Create a unified divider family:
- `Divider` — full-width hairline (hard separation)
- `InsetDivider` — left-padded hairline (grouped list rows)
- `LabelDivider` — hairline with text label (section headers, "OR")
- `SectionHeader` — label + optional "See all" action (for section headers with navigation)

All share: `colors.hairline`, `StyleSheet.hairlineWidth` thickness, consistent insets.

### A2 — Divider usage guidelines
Document when to use each divider type:
- **No divider:** Media feeds, card lists (whitespace separates)
- **Inset divider:** Settings groups, checkout form rows
- **Full-width divider:** Hard section breaks (between major sections)
- **Label divider:** Section headers within a list, "OR" between auth options
- **SectionHeader:** Section headers with "See all" or action buttons

---

## 6. Flagship Acceptance Criteria

- **Shared Divider component** with full, inset, and label variants
- **Consistent hairline color** (`colors.hairline`) across all dividers
- **No inline `borderBottomWidth: hairlineWidth`** — use `<Divider />`
- **LabelDivider** for "OR" and section headers
- **InsetDivider** for grouped list rows
- **No over-division** — remove dividers where whitespace separates
- **Stroke grammar** per AGENTS.md: hairline for separators, 1pt for fields, 2pt for focus

### Thumbnail test
At 25% scale, dividers should be barely visible — they are structural elements, not visual features. If dividers are prominent at 25% scale, they are too strong.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared Divider component | Low | All dividers |
| P1 | M2 — Standardize hairline color | Low | Consistency |
| P1 | M3 — LabelDivider | Low | Auth, checkout |
| P2 | M4 — Replace inline hairlines | Medium (large refactor) | Maintainability |
| P2 | M5 — Remove unnecessary dividers | Low | Visual cleanliness |
| P3 | A1 — Full divider system | High | All divider surfaces |
| P3 | A2 — Usage guidelines | Low | Documentation |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `divider.thickness` | StyleSheet.hairlineWidth (0.5pt) | Per AGENTS.md stroke grammar |
| `divider.color` | colors.hairline | Subtle, low-contrast |
| `divider.inset.left` | Space.md (16pt) | Default inset |
| `divider.inset.right` | 0 (to edge) | Inset from left only |
| `divider.label.font` | Type.caption | 12pt |
| `divider.label.color` | colors.textMuted | |
| `divider.label.padding` | Space.sm | Horizontal padding around label |
| `divider.full.width` | 100% | Full-width |
| `divider.opacity` | 1.0 (use color, not opacity) | Don't use opacity for dividers |

---

*Generated 2026-08-18. Sources: production codebase audit, Instagram divider patterns, eBay inset divider patterns, AGENTS.md §4 stroke grammar.*
