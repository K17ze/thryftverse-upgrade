# Systemic Codebase Flagship-Parity Audit

## 1. Design contract vs runtime contradiction

`Design.md` already says:
- media-first, not chrome-first;
- native, not a web dashboard;
- at most one dominant non-media panel above the fold;
- transparent icon containment by default;
- utility rows can be transparent inside an optional grouped surface.

But runtime primitives still make bordered boxes easy.

### `FlagshipFormSection`
Default implementation creates:
```tsx
backgroundColor: colors.surface
borderColor: colors.border
borderWidth: StyleSheet.hairlineWidth
borderRadius: Radius.lg
```

So simply migrating a screen to a “Flagship” form primitive can reproduce the prototype-card look.

### `PremiumTextField`
Default:
```ts
borderWidth: 1
borderRadius: Radius.lg
backgroundColor: colors.surfaceAlt
```

### `AppInput`
Default:
```ts
borderWidth: Stroke.standard
borderRadius: Radius.lg
backgroundColor: colors.input
```

Fields themselves may legitimately need boundaries. The defect is nesting them inside bordered form cards and then surrounding the screen with more bordered notes/hero/navigation cards.

## 2. Static border hotlist

Repository search for `borderWidth: StyleSheet.hairlineWidth` surfaced screens/components including:
- SellerHubScreen
- MyListingsScreen
- ChangePasswordScreen
- DataExportScreen
- BlockedUsersScreen
- GroupMembersScreen
- BalanceHistoryScreen
- SavedAddressesScreen
- SellerAnalyticsScreen
- ResolutionCentreScreen
- CoOwnTaxDocumentsScreen
- BuyoutScreen
- StyleQuizScreen
- EditGroupScreen
- PostageScreen

Search for `borderWidth: Stroke.standard` also surfaced:
- AppInput
- ReportScreen
- SearchScreen
- BundleBagScreen
- InviteFriendsScreen
- ListingSuccessScreen
- DeleteAccountScreen
- BuyerProtectionScreen
- OutfitBuilderScreen
- LoginScreen
- SyndicateOnboardingScreen
- DataExportScreen
- CreateLookScreen
- CoOwnIssueScreen
- BuyoutScreen
- EditProfileScreen
- CollectionDetailScreen
- VerificationStatusScreen

This is an audit queue, not an instruction to remove every stroke.

## 3. New surface roles

Every visible filled/outlined container must have one role:
```ts
type SurfaceRole =
  | 'canvas'
  | 'field'
  | 'selection'
  | 'state'
  | 'transaction'
  | 'media'
  | 'document'
  | 'groupedRows'
  | 'floatingChrome'
  | 'modal';
```

`section` alone is not a valid reason for a visible border.

## 4. Border budget

### Utility
- 0–1 outlined grouped surface above fold.
- Fields may have boundaries when not also wrapped by another outlined form surface.
- Ordinary sections use whitespace/dividers.

### Commerce detail
- media boundary if needed;
- transaction dock;
- optional trust/document object;
- content sections mostly flat.

### Seller dashboard
- one summary surface maximum;
- task rows mostly flat;
- metrics open on canvas;
- tools navigational, not card tiles.

### Financial/Co-Own
Borders permitted for tables/order book/settlement/documents, not each fact block.

## 5. Recurring composition anti-patterns

### Card ladder
`header → card → card → card → metric grid → CTA → card groups`

Current high-risk example: Seller Hub.

### Overlap card used as generic “premium”
Manage Listing uses media + overlapping info card and then more bordered cards. The composition looks template-driven rather than task-driven.

### Redundant semantic layers
Change Password has screen title + subtitle + security hero + Security form card + note card + sessions card. Too many objects restating one concept.

### Metric semantics risk
Seller Hub derives revenue/conversion from frontend listing arrays. Business KPIs must be order/payment-backed and timeframed or not shown as authoritative metrics.

### Feature-shell risk
Do not expose tabs/CTAs for future backend capabilities.

## 6. Manage Listing truth audit

Two commercial flows need P0 tracing:
- Boost
- auto-accept/minimum-offer settings

Current code paths create local success state after listing patch behavior that does not obviously persist the changed commercial policy itself. Before visual work, trace UI → API → backend → database → reload. If no real mutation exists, remove/disable until implemented.

## 7. Static gates to add

### `check:surface-density`
Review trigger when:
- repeated `surface + border + large radius`;
- nested known surface primitives;
- 3+ large bordered containers on a screen;
- bordered form section wraps already-bordered fields.

### `check:fake-success`
Flag success UI after an API request whose payload does not contain the changed domain state.

### `check:search-contract`
Every frontend search route must have backend contract/integration tests.

### `check:screen-archetype`
Every production route declares its composition role.

## 8. Conclusion

The next elevation should remove visual decisions rather than add more components. Ask for every element:
1. Can it disappear?
2. Can it merge?
3. Can spacing/type replace its container?
4. Is its state real?
5. Is it part of the primary task?
