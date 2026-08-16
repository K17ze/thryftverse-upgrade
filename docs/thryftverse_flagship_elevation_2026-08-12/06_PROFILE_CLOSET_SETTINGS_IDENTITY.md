# Profile, Closet/Saved, Edit Profile & Settings Elevation

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Profile

`MyProfileScreen.tsx` currently combines:
- identity;
- cover/avatar;
- followers/following;
- seller trust;
- completion;
- listings;
- looks;
- Co-Own holdings/portfolio;
- about.

This is comprehensive but risks making the owner profile feel like an account dashboard.

### Target hierarchy

1. identity;
2. social proof;
3. edit/share actions;
4. content tabs;
5. commerce/portfolio as contextual content.

Profile completion should not visually compete with the user’s identity after the account is basically usable.

### Hero
- cover is visual context, not a control panel;
- avatar overlaps seam cleanly;
- display name/username/badge read as one identity block;
- stats are compact and aligned;
- Edit Profile is obvious for self, Follow/Message for others;
- seller trust can sit in a concise trust line.

### Tabs
Keep a small set:
- Listings
- Looks / Posts
- About

Co-Own positions should usually have a portfolio entry, not become a fourth identity axis unless this is central to the public profile model.

---

## Edit Profile

Reference: Instagram-style native settings/edit density.

- flat fields;
- clear labels;
- avatar/cover edit affordances near media, not duplicate entries;
- Save in navigation;
- inline validation;
- no giant cards;
- no excessive helper text.

Use a single edit-media flow for avatar and cover with correct aspect/crop.

---

## Saved / Closet

Use visual collection covers.

Collection card:
- 2x2 mosaic or stable cover;
- name;
- item count;
- optional privacy icon.

No large rounded “Saved” utility cards.

---

## Settings

The current `SettingsScreen.tsx` has good searchability but the information architecture is over-expressive.

### P0: remove AI as a top-level product taxonomy

Current route metadata includes:
- AI Preferences
- AI API Integration
- Agent Directory
- My Agents
- Create Agent
- Your Algorithm

For a mainstream fashion/social marketplace, this makes the product feel like an AI workbench.

Reframe:
- `Recommendations` / `Your feed`;
- `Listing assistance`;
- `Automation & agents` under Advanced/Labs if genuinely user-facing;
- API/provider credentials under Developer settings;
- Bot builder outside routine Settings.

### Settings grouping
Recommended:
- Account
- Privacy & safety
- Buying
- Selling & payouts
- Notifications
- Personalisation
- Accessibility
- Help & legal
- Advanced (conditional)

Rows should be flat. Use section spacing, not section cards.

### Account header
A single compact identity/account row can lead to Edit Profile / account center. Do not repeat profile data across multiple cards.

---

## “AI-made” removal checklist

- [ ] no sparkles beside personalization;
- [ ] no AI section unless intentionally in Labs/Advanced;
- [ ] no excessive verification badge chips;
- [ ] no completion gamification after profile is sufficiently complete;
- [ ] no ornamental gradients behind settings groups;
- [ ] no repeated chevron cards with subtitles when the row label is self-explanatory.

---

## Exact implementation

### P0
- [ ] Define profile information hierarchy and remove competing hero widgets.
- [ ] Settings route taxonomy migration.
- [ ] Move agent/API engineering controls to Advanced/Developer.
- [ ] Normalize settings row height/typography/separators.
- [ ] Saved collections use media mosaic.

### P1
- [ ] Public/private profile variants share one hero contract.
- [ ] Sticky tab rail only after hero scroll threshold.
- [ ] Profile skeleton matches exact geometry.
- [ ] Edit Profile media states include upload/retry/revert.
- [ ] Deep-link settings search results to exact route and, where possible, exact control.

### P2
- [ ] Contextual seller trust details sheet.
- [ ] seller/creator analytics entry only for eligible users.
- [ ] personalisation transparency without AI jargon.

---

## Acceptance
- [ ] Profile identity is the most visually salient element above tabs.
- [ ] No settings screen looks like a dashboard of cards.
- [ ] User can find account/privacy/payment/notification settings rapidly.
- [ ] AI implementation details do not appear in ordinary settings.
- [ ] Saved collection scanning is primarily visual.
