# AUDIT BRIEF v2 — Web Flagship Quality Audit (2026-09-26)

**MODE: pure code + reference research. NO live-preview screenshots.** Audit the
code itself (`web/src`) against the mobile implementation (`frontend/src`) and
against current competitor grammar gathered via `web_search`. Do NOT run a
browser, Playwright, or hit localhost.

Read `web/DESIGN-SYSTEM.md` first — it is the binding contract (dark-first
flagship; flat canvas + hairlines; media is the color; one icon family io5;
`tnum` for money; 44px targets; skeleton not spinner; no emojis).

## Product

ThryftVerse — flagship pre-loved-fashion marketplace. `web/` = full web
replication (Next.js 15 App Router, React 19, Tailwind v4, TS strict, fixture
data mode — `src/lib/data/fixtures*.ts` populate everything; live mode maps
`src/lib/api/`). `frontend/` = native RN/Expo app (~178 screens) — the product
semantics source of truth. When judging whether web IA/copy/states/flows are
correct or complete, cross-check the mobile counterpart files.

## Anti-AI defect classes (binding)

- Generic dashboard silhouette; symmetry-by-default; card-fatigue (every
  section wrapped in rounded surfaces instead of flat canvas + hairlines)
- Label-everything disease; duplicate/restated headings
- Decorative chrome (pills on every control, shadows on cards, gradients,
  glass, emoji)
- Placeholder media treatment (grey boxes, no focal logic)
- Happy-path only (missing loading/empty/error/partial/offline states)
- Verbose explanatory copy
- Hit-area-as-chrome (44px grey circle for a 20px glyph)
- Inconsistent primitives (mixed radii/strokes/icon styles in one viewport)
- Over-scaffolding (wrapper-of-wrapper components, dead abstraction layers)
- **Honesty**: fabricated data/scarcity/metrics/social proof; controls that
  claim an action but only mutate local UI; fixture-only surfaces presented
  as live; counts derived from a different source than what they label
- Desktop-web anti-patterns: hover-only critical actions with no focus/
  keyboard parity, modals where a page/sheet belongs, wasted >1280px width,
  desktop forms with mobile spacing (or vice-versa)

## What to audit in YOUR department (code-level)

1. **Component quality** — read the actual components: composition, prop
   sprawl, dead code, duplicated implementations of the same thing,
   over-scaffolding, hardcoded colors/sizes breaking the token contract.
2. **State machine coverage** — every data surface must have
   loading(skeleton)/empty/error/partial states. Find happy-path-only
   components, silent `catch`, fabricated fallbacks.
3. **Interaction integrity** — buttons/links/sheets: does every handler do
   what the label claims? Trace mutations to store/query-cache/API layer.
   Find dishonest controls (local-only writes claiming server actions),
   dead affordances, SignupWall coverage gaps on guest writes.
4. **Data truth** — rendered fields must exist in `src/lib/contracts/` +
   fixtures/live mappers (`src/lib/api/mappers.ts`). Counts/aggregates must
   derive from the same collection they label. Flag fabricated fields,
   hardcoded "N reviews" not wired to data, optimistic updates that lie.
5. **A11y semantics in code** — roles/aria on interactive elements,
   focus-visible, keyboard handlers on click divs, label associations,
   contrast-risk token misuse (`text-text-muted` on meaningful text,
   `text-scrim-text-primary` off media).
6. **Mobile-parity delta** — read the mobile screen/component counterpart:
   does web carry the same information hierarchy, same actions, same edge
   cases? Name what the mobile version has that web lacks AND what web does
   worse (not just "different").
7. **Competitor grammar** — use `web_search` for CURRENT (2025-2026) grammar
   of your department's reference product(s). Name the pattern, the delta in
   our code, and the transferable fix.
8. **Perceived performance in code** — LCP media priority/`sizes`, client-
   component boundary discipline (`'use client'` creep), heavy work in
   render, missing memoization where lists re-render, hydration hazards
   (persisted store read pre-hydration).

## Constraints

- READ-ONLY everywhere. Do NOT write/edit any file. Do NOT spawn subagents.
  Do NOT run servers, builds, or Playwright. `web_search` IS allowed and
  expected for competitor research.
- Every finding cites `file:line`. No vibes without evidence.
- Findings must be actionable: name the concrete fix, not just the defect.

## Output — return IN YOUR REPLY (you cannot write files)

```markdown
## <Dept> findings
| ID | Sev | Surface | Evidence (file:line) | Reference/delta | Root cause | Proposed fix |
|----|-----|---------|----------------------|-----------------|------------|--------------|
| XX-01 | P1 | /item/[id] | pdp/BuyPanel.tsx:88 | eBay: sticky buy box … | column not sticky under lg | … |

## Dept summary
P0: n · P1: n · P2: n · P3: n
Top-3: …
```

Severity: **P0** broken/dead/dishonest/fails flagship outright · **P1** quality
caveat a senior designer would flag (hierarchy, parity, honesty, missing
state) · **P2** polish · **P3** nice-to-have. Aim for the 5-15 most material
findings — quality over count.
