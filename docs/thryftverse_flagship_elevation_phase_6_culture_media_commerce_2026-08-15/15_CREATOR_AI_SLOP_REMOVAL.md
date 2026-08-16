# Creator AI-Slop Removal Audit

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## Concrete current symptoms

### Fake font variety
Ten names, mostly one font family.

### Design commentary leaking implementation thinking
Source comments repeatedly reference competitor patterns and “premium/flagship” behaviour.

Comments should describe invariants, not self-congratulate.

### Too many generic layer categories
A huge list of stickers/content can exist, but the default editor must not expose its entire type system.

### Over-animated selection
Haptics on selection changes, spring handles, guide animations, badges can accumulate into tool noise.

### Generic effects
Neon/glow/outline are easy to implement but can pull the visual culture away from the supplied references.

## Phase 6 cleanup

- creator presets are art-directed;
- default tools are small;
- advanced tools contextual;
- no internal “layer” terminology in first-run UI;
- no “AI” naming for layout/recommendations;
- remove comments naming competitor patterns unless they explain an intentional researched invariant;
- simplify haptic frequency;
- animation is direct manipulation only.

## Human review

Give the editor to a designer/stylist without explaining it.

Observe:
- first text;
- first product;
- reorder;
- swap;
- publish.

If they ask where “the real editor” is or why the tools look generic, the phase is not complete.
