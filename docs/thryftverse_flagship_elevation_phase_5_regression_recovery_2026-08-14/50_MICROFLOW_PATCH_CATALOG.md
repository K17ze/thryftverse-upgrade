# Micro-flow Patch Catalog — Exact Small Sections to Elevate

> Audit date: 2026-08-14  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

# Messaging

## Message Requests
Current target:
- identity;
- message preview;
- Accept / Delete / Block/report.
Do not expose full Chat capability before acceptance if privacy says otherwise.

## Shared Media
Media grid.
Filter Photos/Videos only if enough content.
Tap fullscreen.
No generic document-card list for images.

## Quick Replies
Seller productivity role.
Flat list + Add.
Editor: shortcut/title + message.
Do not mix with customer chat composer unless explicitly invoked.

## Report Chat/User
Reason list → details optional → submit → confirmation.
No red card wall.

# Marketplace

## Make Offer
Product thumbnail.
Listing price.
Offer input.
Seller response time/expiry.
Review.
Send.

Do not treat offer as a free-form chat message.

## Counteroffer
Show previous proposal and new amount.
One decision.

## Size Guide
Category/brand data source.
If not authoritative, label general guidance.
Do not fake precise brand sizing.

## Ask Seller
Composer with listing context.
After send, show in chat/Q&A according to product semantics.

## Price Alert
Simple enable + threshold/any-drop choice.
No dashboard.

## Create Collection
Name + selected items.
Cover mosaic automatic.
No separate cover designer initially.

## Report Listing
Reason → optional evidence → submit.
Preserve listing context.

# Seller

## Mark Sold
Explain off-platform vs sold-through-app semantics.
Do not manipulate order history incorrectly.

## Relist
Preview inherited fields/media.
Confirm availability/condition.

## Vacation/Holiday
If unsupported backend, do not add merely because competitors have it.

# Profile

## Followers/Following
Flat people list.
Search.
Follow button only if appropriate.
No cards.

## Blocked Users
Flat utility list + unblock.

## Profile Media
Pick/crop/preview/save.
Failure leaves previous media intact.

# Auction

## Watch
Immediate local optimistic state + server sync.
Notification preference optional via separate control.

## Outbid
Notification opens exact auction with current state refreshed.

# Co-Own

## Market Alert
Only if backend supports real alert state.
No local fake alert that disappears cross-device.

# Creator

## Draft Recovery
Show preview + modified time.
No technical JSON/layer counts.

## Publish Failure
Preserve draft.
Retry only failed stage.
Do not duplicate post after retry.

# Wallet

## Receipt
Amount.
Fee.
Rate if conversion.
Reference.
Time.
Share/export only if real.

# Universal rule

Each micro-flow gets:
- one dominant action;
- one cancel/back;
- server truth;
- recoverable error;
- no inert feature.
