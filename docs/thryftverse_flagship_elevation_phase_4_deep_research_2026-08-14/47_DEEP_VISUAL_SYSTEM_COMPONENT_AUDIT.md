# Deep visual system component audit — what to delete, flatten or specialize

This document prevents Phase 4 from becoming another token migration.

---

# 1. Audit every component against five questions

1. Is this a **content object**, **navigation**, **transaction**, **evidence**, or **utility**?
2. Does it need explicit containment?
3. Does it need a radius?
4. Does it need an icon?
5. Does it need helper copy?

If the implementation cannot answer, the component is visually over-specified.

---

# 2. Generic “hero card” anti-pattern

Seen across many app departments:
- analytics;
- connections;
- wallet-like surfaces;
- settings/account summaries.

A hero is only justified if one thing truly dominates.

Good:
Galleria editorial hero.

Questionable:
`3 of 4 providers connected` inside large hero card.

Better:
plain header/subtitle or compact status line.

---

# 3. Metric cards

Use card only when metric is individually interactive or has chart/context.

If eight numbers share the same visual structure:
prefer grid/rows with implicit grouping.

Remove:
- icon circle;
- border;
- radius;
from every KPI.

---

# 4. Section cards

Do not wrap:
- title;
- 3 rows;
inside rounded card automatically.

Settings/reference quality often uses:
heading + rows + hairlines.

---

# 5. Badge taxonomy

Create a central badge audit.

Types allowed:
- verification;
- transaction status;
- live;
- count;
- promotional label if truthful.

Each visual badge must map to a semantic type.

Delete “badge” use for:
- category label;
- helper phrase;
- metadata that is already text.

---

# 6. Icons

## Leading row icon
Use only if scan benefit > visual noise.

Examples:
Settings:
Account, Privacy, Payment icons at group level maybe.
Not every leaf row.

Product trust:
small icon can help 3 trust facts.

Seller analytics:
metric icon not needed for every KPI.

---

# 7. Cards inside cards

Search code for likely nesting:
- `surface` background child inside `surface` card;
- radius parent + radius child;
- `borderWidth` repeated.

Manual screenshot audit.

Rule:
one containment layer per information group unless nested child is a distinct tangible object.

---

# 8. Glass

Allowed:
- iOS nav/tab;
- creator controls over media;
- transient floating toolbar.

Not:
- settings content card;
- seller metric card;
- product information section;
- Co-Own evidence block.

---

# 9. Dark mode

Dark flagship is not:
`#000 background + grey cards everywhere`.

Use:
- near-black base;
- surfaces only when needed;
- image color;
- strong text;
- subtle hairline.

Provided Pinterest references demonstrate how dark canvas can feel rich because content supplies color.

---

# 10. Brand/gold accents

The project has used antique gold.

Use only for:
- selected brand moments where luxury/editorial identity justifies;
- possibly Co-Own/Galleria accent.

Do not use gold for:
- progress;
- generic button;
- every premium surface;
- normal marketplace listings.

Brand identity must not override semantic hierarchy.

---

# 11. Radius count per viewport

A useful audit heuristic:
count distinct rounded rectangular objects.

If ordinary settings viewport has >4 separate rounded boxes, challenge each.

If Home viewport has tiles, tile radius is media object geometry and acceptable; metadata should not add more boxes.

---

# 12. Text hierarchy count

Most screens need:
- title;
- body;
- meta;
- optional price/display.

If 6 weights/sizes appear in one small card, hierarchy is compensating for too much content.

---

# 13. Empty-state primitive

Current generic `EmptyState` is useful but can homogenize every department.

Allow specialized empties:
- Closet: visual saved placeholder;
- Inbox: simple text;
- Galleria: editorial;
- Seller: action list.

Do not always show icon in circle + title + subtitle + CTA.

---

# 14. Skeleton primitive

Skeleton must inherit department geometry.

Avoid one “premium skeleton tile” aesthetic across:
- editorial;
- metrics;
- chat;
- settings.

---

# 15. Global animation wrappers

Search for:
`FadeInDown`
`FadeIn`
`withSpring`

Classify each:
- state continuity;
- direct manipulation;
- decorative.

Delete decorative animation from:
- seller metrics;
- settings sections;
- provider rows;
unless user study proves value.

---

# 16. Acceptance audit script concept

Create a development-only static/report tool that identifies:
- files with >N `borderRadius`;
- files with >N `borderWidth`;
- use of LinearGradient;
- FadeInDown count;
- color literal count;
- pill/radius.full count.

This is **not** a failure gate by itself.
It produces audit targets for human visual review.

The goal is not zero radius. The goal is intentional radius.
