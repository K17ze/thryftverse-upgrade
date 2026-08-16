# Agent Execution Prompts
## Run sequentially

# PROMPT 7A — Surface Hierarchy V2

Read `Design.md`, `AGENTS.md` and this closure folder.

Mission: remove systemic prototype card/border appearance without flattening affordance.

Required:
1. `FlagshipFormSection` default flat; explicit grouped/state variants.
2. `AppInput`/`PremiumTextField` appearance modes.
3. `FlagshipNavigationRow`, `FlagshipMetricLine`.
4. surface-role contract.
5. `check-surface-density`.
6. migrate ChangePassword, SellerHub, ManageListing first.
7. classify every retained/removed border.
8. preserve dark mode, hit targets, error/focus.
9. test primitive variants.
10. native screenshots required; if unavailable say `Visual QA pending`.

# PROMPT 7B — Manage Listing truth + redesign

Trace Boost and offer preferences UI → API → backend → persistence → reload.

If not real, remove/disable before styling.

Rebuild:
- flat media/identity;
- one primary Edit action;
- Price & offers row;
- Delivery row;
- Format row;
- compact real activity;
- real promotion only;
- destruction in terminal/overflow section.

Acceptance:
- every action real;
- ≤1 dominant non-media surface above fold;
- no card ladder;
- state survives reload;
- native screenshots.

# PROMPT 7C — Asset Detail V4

Recompose `AssetDetailScreen.tsx` using `08_...`.

First viewport only:
- media;
- title/category;
- unit price;
- availability/market state;
- user position;
- Buy/Sell.

Then trust line, story, Market, Advanced Market, Due Diligence.

Do not delete advanced capability; move it behind progressive disclosure. Deduplicate dossier facts. Preserve fail-closed trading.

# PROMPT 7D — Group user search

Trace `searchUsers()` and `/users/search`.

If backend route absent, implement:
- normalized indexed search;
- deterministic ranking;
- auth;
- blocked/privacy filtering;
- rate limiting;
- pagination.

Add backend tests + native group-creation E2E. Then simplify people picker rows.

Complete only when a real account can search another real username and create a group.

# PROMPT 7E — Seller Hub OS V2

Backend first:
- seller overview aggregate;
- real order tasks;
- payout state;
- sales/fees/refund/net;
- inventory counts.

Frontend:
- money summary;
- Needs You;
- Create listing;
- inventory;
- storefront;
- analytics drill-down.

Remove synthetic revenue/conversion. Remove card ladder.

# PROMPT 7F — Profile IA

In `MyProfileScreen`:
- remove Saved from primary tab rail;
- retain private Saved/Closet in owner utility navigation;
- keep tabs authored/public.

Audit `UserProfileScreen` for public/private parity.

Do not surface Collections/Drops unless domain-real.

# PROMPT 7G — Fulfilment V2

Replace `standard|express` + payer toggles with:
- package profile;
- integrated/custom/pickup;
- real service quote model;
- buyer-pays/seller-subsidized policy;
- handling time;
- reusable policies;
- per-listing override.

Sell/Edit shows a single Delivery summary row.

Integrate Product Detail, Checkout, Order Detail, Seller Fulfilment, Seller Hub and Manage Listing.

# PROMPT 7H — Whole-codebase visual sweep

Enumerate all `AppNavigator` production routes.

For each:
1. assign archetype;
2. inspect border/card/chip/icon-container density;
3. validate controls;
4. validate domain truth;
5. test states;
6. score 10 dimensions;
7. change only screens below threshold.

Output:
- before score;
- files changed;
- reason for each surface removed/retained;
- code-backed after score;
- native screenshots;
- remaining gaps.

Never claim optical flagship acceptance without rendered device evidence.
