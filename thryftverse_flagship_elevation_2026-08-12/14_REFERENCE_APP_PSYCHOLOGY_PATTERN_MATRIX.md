# Reference-App Psychology & Pattern Matrix

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Principle

Reference apps are useful for **interaction truths**, not surface cloning.

The goal is to extract why a pattern works and rebuild it in Thryftverse’s product language.

| Reference | Pattern to learn | Psychology | Thryftverse application | Do not copy |
|---|---|---|---|---|
| Pinterest | high media density + masonry | visual recognition faster than metadata scanning | Home/discover/save | exact card chrome |
| Pinterest | visual search | image can be a query | Visual Search | branded iconography |
| Instagram | restrained profile/inbox/settings rows | familiar social hierarchy | Profile, inbox, settings | exact colors/navigation |
| Instagram Instants 2026 | camera-first authentic fast path | sharing friction falls when choices are delayed | Poster Quick Capture | ephemeral rules unless product needs them |
| Snapchat | viewfinder-first camera | creation begins with the world, not a form | Poster camera | lens branding/gestures blindly |
| Depop | authentic seller photography | individuality + condition create trust | Sell/PDP | exact four-photo limits |
| Depop | drafts / suggested pricing | reduces listing effort | Sell | AI branding |
| Vinted | clear condition and item detail | expectation alignment | Sell/PDP | visual theme |
| eBay | deep product gallery + photo editing | evidence reduces uncertainty | Sell/PDP | dense legacy information hierarchy |
| eBay | strong primary transaction CTA | decision clarity | PDP/checkout | exact button labels where mode differs |
| Meta Seller 2026 | seller home surfaces work needing attention | operators think in tasks | Seller Hub | Facebook IA |
| Apple iOS 26 | content beneath adaptive navigation/control material | chrome has hierarchy and place | top bars, tabs, overlays | glass on every card |

---

# Psychological principles

## 1. Recognition over recall
Use:
- media thumbnails;
- recognizable icons;
- previous selections;
- contextual action.

Avoid making users remember where an advanced setting lives.

## 2. Hick’s Law
More simultaneous choices increase decision time.

Application:
- camera entry should not show all Studio options;
- seller listing format should be progressive;
- settings should not expose six AI/agent destinations to ordinary users.

## 3. Progressive disclosure
Power remains, complexity arrives later.

This is the key design principle for a multi-department super-app.

## 4. Visual hierarchy before decoration
Size, placement, contrast and whitespace should solve emphasis before gradients/shadows.

## 5. Trust through evidence
Marketplace trust comes from:
- real images;
- flaws;
- seller identity;
- transaction rules;
- transparent totals.

Not from a “trusted” badge without evidence.

## 6. Commitment gradient
Ask for easy choices first:
- choose media;
- accept/edit suggested details;
- set price;
- shipping;
- publish.

Do not begin listing with a long form.

## 7. Endowment / continuity
Saving drafts and preserving scroll/edit position makes work feel owned and prevents restart cost.

## 8. Peak-end rule
Transaction confirmation and publish success need to be calm and unambiguous. A beautiful feed cannot compensate for an uncertain payment/publish ending.

## 9. Error prevention > error copy
Disable impossible actions only when reason is visible. Validate early. Preserve user work.

## 10. Variable content, stable chrome
Feeds change constantly. Navigation and interaction grammar should not.

---

# “Flagship” visual cues that are actually engineering cues

- no image layout jump;
- scroll position restoration;
- immediate pressed state;
- keyboard choreography;
- safe-area correctness;
- stable tab selection;
- media keeps aspect ratio;
- error recovery;
- no duplicate transaction;
- no stale CTA after state change;
- no blank placeholder content;
- no 1-frame white flash in dark mode.

These tiny behaviors often contribute more to perceived quality than adding a new animation.
