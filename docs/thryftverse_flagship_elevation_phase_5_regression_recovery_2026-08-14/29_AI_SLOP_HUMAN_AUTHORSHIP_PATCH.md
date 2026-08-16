# AI Slop / Non-human Authorship Audit & Patch Strategy

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## AI slop is not just AI copy

The strongest signs are process artifacts:

### Mechanical global transformations

Example:
“remove cards / flatten everything”
applied across unrelated roles.

Human art direction asks what the object is for before changing it.

### Feature inventory UI

Every implemented capability receives:
- tab;
- pill;
- row;
- badge;
- card.

Human design chooses what remains invisible.

### Overcorrection

Phase 4 Home:
remove title/seller/condition → media-first becomes anonymous.

Human design defines a minimum information floor.

### Fake or inert affordance

Create Group’s Group Photo control visually promises action without handler.

No production UI should advertise nonexistent capability.

### Copy-driven semantics

Notifications parsing title/body to determine event type.
Business logic should not infer meaning from marketing copy.

### Fixture beauty hiding production truth

A beautiful fixture dataset can make a weak backend contract look like a strong UI.

### MockData domain ownership

Production code importing types from mock fixtures is a visible architecture smell because it encourages fixture-shaped product decisions.

### Repetitive “design system” composition

Same radius / icon circle / subtitle / badge everywhere.

### Excessively generic empty states

A generated product often uses the same empty template for every context.

## Patch method

For every screen:
1. identify product role;
2. write user question;
3. count visible controls;
4. count repeated containers;
5. mark false/inert affordances;
6. mark copy-based inferred semantics;
7. mark fixture-only richness;
8. redesign hierarchy;
9. test real backend data;
10. human screenshot review.

## Code-review prompt

Reviewer must answer:

- What is the dominant user job?
- What changed visually and why?
- Which information was removed?
- Is any removed information necessary for a decision?
- Does real API data still look intentional?
- Does any visible control lack end-to-end behavior?

If answers are missing, do not merge.
