# Anti-“AI-made” visual doctrine

This is the most important Phase 4 document.

The undesirable “AI-made” impression does **not** primarily come from literal AI copy. It comes from design patterns common to generated interfaces: comprehensive exposure, excessive symmetry, repeated cards, indiscriminate gradients, generic helper copy, overuse of pills, and animation attached to every component.

## A. Visibility budget

Every viewport gets a budget.

### Standard commerce/detail viewport
Visible by default:
- 1 subject/media object;
- 1 identity block;
- 1 price/action hierarchy;
- up to 3 trust facts.

Everything else waits.

### Feed/discovery viewport
Visible by default:
- media;
- only metadata needed to decide whether to open;
- one interaction signal if useful.

Do not put seller avatar + seller name + title + price + condition + badges below every tile.

### Messaging viewport
Visible by default:
- person/context;
- messages;
- composer.

Agent state, listing context, safety, offer state and quick replies appear only when relevant.

### Settings viewport
Visible by default:
- section label;
- rows;
- value or disclosure chevron.

No hero cards unless there is a unique account problem needing attention.

### Analytics viewport
Visible by default:
- one main outcome;
- time range;
- trend;
- 2–4 supporting metrics.

Do not render eight metric cards because eight metrics exist.

## B. Card budget

Use explicit rounded containment only when one of these is true:

1. the whole region is one draggable/tappable object;
2. the region needs separation from content beneath it;
3. the region represents a transactional state;
4. the region is media with an intrinsic shape;
5. the region is a temporary message/callout.

A section is not automatically a card.

Preferred substitutes:
- whitespace;
- hairline;
- typography;
- alignment;
- background plane change;
- image geometry.

## C. Pill budget

Permanent pills should be rare.

Allowed:
- one compact scope/segment control;
- transient active filter chips;
- selected taxonomy tokens in an editor;
- status whose rounded shape materially improves recognition.

Do not use pill styling simultaneously for:
- tabs;
- counts;
- filters;
- tags;
- status;
- actions;
- labels.

## D. Icon-circle test

Before putting an icon inside a colored circle, ask:

> Is the circle itself carrying state, hierarchy or affordance?

If not, use the icon alone.

The repeated `circle + icon + title + subtitle` pattern is one of the strongest synthetic-dashboard signals.

## E. Gradient test

Gradient allowed when:
- legibility needs a scrim over imagery;
- an authored brand/creative asset requires it;
- progress/material genuinely communicates a continuous range.

Gradient not allowed as a generic “premium” fill.

## F. Copy test

Remove copy that:
- explains obvious UI;
- narrates implementation;
- congratulates ordinary actions;
- names the system architecture;
- repeats a visible value.

Examples:

Bad:
- “Explore market depth”
- “AI-powered suggestion”
- “Your keys are stored on this device only” repeated on every provider row
- “Successfully published your story!”

Better:
- “Order book”
- “Suggested from sold items”
- one security note at the screen level
- “Shared”

## G. Motion budget

One animation family per state transition:
- navigation = spatial;
- selection = subtle scale/position;
- content swap = crossfade only if continuity needs it;
- transaction success = resolve state and move forward;
- errors = no shaking/bouncing unless specific system convention.

Avoid staggered `FadeInDown` on every section of an ordinary settings/analytics page.

## H. Color budget

Brand color should mean:
- current selection;
- primary action;
- intentional identity/accent.

Do not use brand color to make otherwise unimportant metrics feel “premium.”

Semantic colors only for semantic meaning:
- danger;
- warning;
- success;
- live/urgent.

## I. Department-specific visual identity

A flagship super-app can share tokens while each department feels distinct:

- Home/Explore: editorial image rhythm.
- Product: retail photography and trust.
- Auction: time/price tension.
- Co-Own: catalogue/evidence sophistication.
- Creator: black canvas/direct manipulation.
- Chat: human conversation.
- Wallet: calm financial ledger.
- Settings: neutral flat structure.
- Seller: operational, concise productivity.

If every department has the same hero card, metric cards and chip row, the brand system has swallowed product meaning.
