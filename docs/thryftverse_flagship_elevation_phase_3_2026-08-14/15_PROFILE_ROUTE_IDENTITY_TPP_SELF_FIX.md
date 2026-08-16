# Profile Route Identity — TPP/Public vs Self Fix

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Root cause

`UserProfileScreen` currently determines self from a route flag or `userId === currentUser.id`, substitutes owner data, and passes self state into `ProfileHero`. The hero then renders Edit Profile.

The public/TPP route is therefore not a pure projection.

## Correct invariant

### MyProfile
Owner only:
- Edit
- private completion/growth
- seller controls
- private shortcuts
- owner stats.

### UserProfile
Public only:
- public endpoint;
- Follow;
- Message;
- Share;
- Report/Block when relevant;
- no Edit;
- no private local media overrides;
- no owner-only review controls.

It remains public even if someone accidentally passes the current user ID.

## Canonical resolver

Create `frontend/src/navigation/openProfile.ts`.

```ts
export function openProfile(navigation, targetUserId, currentUserId) {
  if (targetUserId === currentUserId) {
    navigation.navigate('MyProfile');
  } else {
    navigation.push('UserProfile', { userId: targetUserId });
  }
}
```

## Remove

- `isMe` route param from public profile route;
- self branch from `UserProfileScreen`;
- `onEditProfile` from public hero;
- owner media overrides from public route;
- owner seller-response UI from public route.

## Shared components

If needed:
- `ProfileIdentityHero`
- `OwnerProfileActions`
- `PublicProfileActions`

Viewer identity should not be embedded in a shared hero component.

## Navigation sweep

Replace direct UserProfile navigation in:
- GroupMembers
- Notifications
- ItemDetail
- PosterViewer
- OrderDetail
- Checkout
- AssetDetail
- AuctionDetail
- Chat
- reviews
- follower/following sheets
- seller rows.

## Deep links

Self deep link must normalize before mounting UserProfile.

## Tests

- UserProfile with current user ID never renders Edit.
- helper maps current ID to MyProfile.
- public route never reads owner media overrides.
- public route never performs owner edit navigation.
- self deep link normalizes before first public render.
- block/report never appears against self because self is not rendered in public route.
