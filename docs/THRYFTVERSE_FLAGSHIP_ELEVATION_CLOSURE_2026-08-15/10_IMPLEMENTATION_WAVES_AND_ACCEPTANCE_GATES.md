# Implementation Waves + Acceptance Gates

# Wave 7A — Surface hierarchy foundation

Code:
- redesign `FlagshipFormSection`;
- add input appearances;
- add flat navigation row;
- add metric line;
- add semantic surface roles;
- add `check:surface-density`.

Migrate first:
- ChangePassword;
- SellerHub;
- ManageListing;
- DataExport;
- BlockedUsers.

Exit:
- no functional regression;
- native screenshots show major reduction in visible boxes;
- focus/error affordance remains clear.

# Wave 7B — Functional P0

## New Group
- verify/implement `/users/search`;
- backend contract tests;
- native E2E.

## Manage Listing
- real boost mutation or remove;
- real offer-policy mutation or remove;
- real listing state mutations.

Exit: no visible commercial/search control is fake.

# Wave 7C — Core reconstructions

Order:
1. Manage Listing;
2. Change Password;
3. Asset Detail;
4. Seller Hub;
5. MyProfile;
6. Sell Shipping;
7. New Group visual polish after search works.

Commit independently.

# Wave 7D — Seller + fulfilment backend

Backend:
- SellerHubOverview;
- payout summary;
- order tasks;
- listing issue tasks;
- fulfilment policies;
- carrier/service quote contract;
- label/tracking if integrated;
- offer policy.

Frontend:
- task-first Seller Hub;
- reusable policy in Sell/Edit/Manage;
- buyer-facing delivery summary;
- order fulfilment.

# Wave 7E — Whole-codebase parity sweep

For every production route:
1. assign archetype;
2. capture baseline;
3. run surface-density review;
4. validate visible-control truth;
5. inspect loading/empty/error/offline;
6. score;
7. migrate only if below threshold.

Do not rewrite already-passing screens for activity’s sake.

# Wave 7F — Native visual release gate

Devices:
- compact iPhone;
- large iPhone;
- 360dp Android;
- current Pixel-class Android.

Themes:
- light;
- dark.

Core screenshot matrix:
- Home
- Search
- MyProfile
- UserProfile
- ItemDetail
- Sell
- ManageListing
- SellerHub
- Checkout
- Inbox
- NewGroup
- AuctionDetail
- CoOwnHub
- AssetDetail
- Portfolio
- Look Composer
- Poster Composer
- Settings
- ChangePassword
- Wallet

Block for:
- clipped text;
- sticky overlap;
- unintended border recurrence;
- bad safe area;
- poor contrast;
- missing/blurry media;
- header mismatch;
- keyboard-covered CTA;
- inert/fake control;
- dark-mode inconsistency;
- dead-end empty state.

# Behavioral gates

Search:
- cancel/ignore stale requests;
- responsive result refinement;
- retry preserves query.

Navigation:
- no redundant intermediate screens;
- correct back/dismiss behavior.

Authoring:
- draft survives background/navigation;
- retry resumes upload state.

Commerce:
- total/status values authoritative.

Co-Own:
- trading fail-closed when holdings/market truth unavailable.

Seller:
- tasks/counts match real records.

# Accessibility

- do not treat globally disabled text scaling as acceptable long-term;
- 44pt hit target;
- screen-reader state;
- reduce motion;
- contrast;
- focus order;
- errors not color-only.

# Closure condition

```text
Implementation tests       PASS
Domain truth               PASS
iOS screenshot             PASS
Android screenshot         PASS
Interaction recording      PASS
Empty/error/offline        PASS
Accessibility              PASS
Human optical review       >=9/10
```

Tests alone are not visual closure.

Stop only when no core journey is below 9/10 and no P0/P1 parity defects remain.
