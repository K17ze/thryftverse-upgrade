# Frontend Engineering Debt Affecting Flagship Quality

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## 1. Domain types owned by mockData

Seen in:
- ProductCardV2;
- BackendDataContext;
- chatApi and related legacy surfaces.

Move types to:
`domain/`
or generated contract modules.

## 2. Screen-local presentation policy

Home has its own tile presentation while ProductCardV2 has another.
This is okay if intentional role-specific components, but currently some divergence is accidental.

Create role-specific card components with shared media primitives.

## 3. Dynamic monitoring require

Home uses a safe dynamic `require` to avoid circular dependency for monitoring.
Move this behind:
`monitoring/interaction.ts`
with a stable no-op adapter.

Screens should not know circular-import workarounds.

## 4. Dead semantic names

Examples:
- legacy content-type names such as clip/posters after features changed;
- components whose file name no longer matches visible product concept.

Semantic debt causes future agent regressions.

## 5. Large screens

Continue decomposing controllers/view models from composition.
Do not extract every 30-line visual fragment into a generic component merely to reduce file size.

## 6. Loading/error duplication

Use domain-aware state canvases but avoid one generic empty-card aesthetic.

## 7. Runtime mode visibility

Developer diagnostics should show:
- fixture;
- API;
- cache;
- offline.

Do not expose to users.

## 8. Gesture ownership

Maintain explicit gesture conflict tests for:
- Home;
- Product;
- Creator;
- Chat;
- draggable collections.

## 9. Performance

Track release p95:
- Home first media;
- search first result;
- chat open;
- creator ready;
- product media;
- wallet cached balance.

## 10. Source comments

Remove comments that state styling doctrine (“flagship”, “premium”) rather than invariant/reason.
