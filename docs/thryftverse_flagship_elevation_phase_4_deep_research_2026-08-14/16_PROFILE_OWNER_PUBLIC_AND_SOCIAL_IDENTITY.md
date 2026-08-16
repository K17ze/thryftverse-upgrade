# Profile — owner/public social identity

## Code surfaces inspected / affected

- `frontend/src/screens/MyProfileScreen.tsx`
- `frontend/src/screens/UserProfileScreen.tsx`
- `frontend/src/components/profile/*`
- `frontend/src/navigation/openProfile.ts`

## Current diagnosis


Owner/public separation is a foundational win. The remaining owner-screen problem is dashboard contamination: MyProfile can include completion, growth tasks, Co-Own portfolio, trust, listings, Looks and About.

The public-facing identity should remain dominant even on the owner route.


## User psychology / product job


A profile is first a social identity object. Owner utilities are maintenance tasks.

The user expects:
- who am I / who is this;
- credibility;
- social graph;
- what do I sell/create.

They should not feel that opening their own identity also opens a seller-admin dashboard.


## Flagship target composition


First viewport:
- cover;
- avatar;
- display name / @handle;
- concise bio;
- follower/following;
- one trust line;
- owner utility icon(s) OR public Follow/Message.

Then:
- Shop;
- Looks;
- About.

Owner-only maintenance lives in utility rail/sheet.


## Detailed implementation map


1. Completion prompt:
   - small contextual utility;
   - disappears at 100%;
   - never takes hero-card dominance.
2. Growth tasks move to seller center/analytics; at most one subtle nudge on profile.
3. Co-Own portfolio becomes utility destination, not a large profile content block.
4. Trust badge uses recognizable single line; full trust detail opens on tap.
5. Cover media upload affordance appears only for owner and only on interaction/explicit edit mode.
6. Public and owner grid geometry remains identical to preserve identity continuity.
7. Collapsed scrolling header should transition from hero identity, not abruptly duplicate controls.
8. Followers/following open flat people lists/sheets.
9. About uses flat rows only for factual account/seller info; biography remains text.


## Micro-detail pass


- Avoid every stat separated by vertical divider if whitespace suffices.
- Cover crop and focal point must be persistent across sizes.
- Avatar border only conveys active story/status if such state exists; don't add decorative rings.
- Public Follow is primary; Message secondary.


## Acceptance / screenshot QA


Screenshots:
- new/incomplete owner;
- complete owner;
- public seller;
- public non-seller;
- no cover/avatar;
- long bio;
- narrow screen.

Pass:
- owner route still looks like a profile, not seller dashboard.


## Reference crosswalk


- Instagram reference: identity + content dominate, administrative functions recede.
- Depop marketplace profile: seller credibility near shop content.
