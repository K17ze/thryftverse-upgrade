# Deep Notification + Group Wireframes

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

# Notifications

## Default

```text
Notifications                                •••

Needs attention

[bag] You were outbid on Prada 2005 bag
      £450 is now leading · 3m
                                      Bid again >

[box] Ship Acne Studios scarf by tomorrow
      Order #TV-1234
                                      View order >

Today

[M][A] Maya and 4 others liked your Look
       1h

[shoe] Your order has shipped
       Arrives Tue–Wed · 2h
```

No permanent All/Unread chips.

Filter toolbar button:
`filter` icon.
Badge only when active.

## Filter sheet

```text
Filter notifications

[ ] Unread only

Type
( ) All
( ) Orders
( ) Auctions
( ) Messages
( ) Social
( ) Saved & prices
( ) System

Clear                         Apply
```

If multi-select is truly useful, use checks, but do not create combinations nobody needs.

# Create Group

## Stage 1

```text
New group                                    Next

[ Search people ]

Selected
[ Maya × ] [ Noor × ] [ Dan × ]

Suggested
(o) Alex Johnson
(o) Samira K.
(o) Luca

Recent
(o) ...
```

Next disabled until minimum membership.

## Stage 2

```text
New group                                  Create

       [ member mosaic ]
         Add photo

Group name
Weekend Finds________________

Add description

6 members
[M][N][D][+3]
```

If custom avatar functionality is not available:
remove `Add photo` entirely and use mosaic.
Never leave an inert camera icon.

# Group Info

```text
          [mosaic/avatar]
          Weekend Finds
   6 members · 1 agent

 Members      Media      Agents
--------------------------------
Notifications                    >
Quick replies                    >
Archive                          >
--------------------------------
Add members                      >
Invite link                      >
--------------------------------
Leave group
```

Only show Add/Invite if backend supports them.

# Members

Flat people rows:
real avatar/name/username.
Owner/Admin text.

No `User 3f8a91` fallback.

# Acceptance

Capture these with:
- fixture;
- seeded backend;
- long names;
- missing avatar;
- offline.
