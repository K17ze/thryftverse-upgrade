# Onboarding, Auth, Trust & Accessibility Production Standards

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Auth / onboarding

Flagship onboarding should feel fast and trustworthy, not like a marketing deck.

### Sequence
- value proposition — brief;
- sign in / create account;
- minimum profile;
- interests/categories only if they materially improve first feed;
- permissions contextual, not all at startup.

### Permission psychology
Ask when the benefit is visible:
- camera when entering camera;
- photos when importing;
- notifications after a meaningful notification use case;
- location only where delivery/discovery needs it.

Never show a custom pre-permission screen for every permission unless it increases comprehension.

---

## Trust and safety

Marketplace trust surfaces should be user-centric:
- identity/verification;
- report/block;
- safe payment;
- buyer/seller protection;
- counterfeit/authentication;
- returns/disputes;
- prohibited items.

Do not bury safety inside settings.

---

## Accessibility production requirements

### Touch
- iOS minimum target concept: at least 44pt;
- Android target: at least 48dp where applicable;
- increase hitSlop without increasing visible chrome.

### Text
- Dynamic Type / text scaling;
- no fixed-height text controls that clip;
- prices and critical statuses remain readable;
- long localization strings tested.

### Motion
- reduced motion disables non-essential transform/parallax;
- progress/state remains understandable without motion.

### Transparency / contrast
- glass/material chrome remains legible under accessibility settings;
- do not encode state by color alone.

### Screen reader
- media alt/labels;
- selected/unselected state;
- auction and financial values in logical reading order;
- combined row labels for dense list rows;
- actionable hints only where useful.

### Keyboard/web
- focus-visible;
- logical tab order;
- Esc closes sheets;
- Enter/Space activates appropriate controls;
- no pointer-only interactions.

---

## Empty/loading/error/offline

Create one semantic state system:

### Loading
Skeleton only if final geometry is known.
No generic “shimmer everywhere.”

### Empty
Explain:
- what is empty;
- why if known;
- one useful next action.

No breathing decorative icon.

### Error
Specific, recoverable:
- retry;
- change input;
- open settings;
- contact support.

### Offline
Preserve cached content when possible. Banner should not replace the whole screen unless the action truly requires network.

---

## Acceptance
- [ ] all permission prompts are contextual;
- [ ] all flagship screens work at 200% text;
- [ ] no essential action is color-only;
- [ ] reduced motion verified;
- [ ] web keyboard path verified;
- [ ] error states have a recovery path.
