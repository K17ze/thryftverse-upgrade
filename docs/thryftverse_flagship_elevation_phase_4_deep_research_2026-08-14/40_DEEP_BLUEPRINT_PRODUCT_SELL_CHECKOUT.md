# Deep blueprint — Product Detail, Sell and Checkout

These three surfaces form one conversion chain:

`discovery → confidence → seller data quality → purchase`

They should therefore share truth, not share one generic visual template.

---

# Part I — Product Detail

## 1. Current risk inventory

`ItemDetailScreen.tsx` coordinates:
- media;
- item identity;
- family badge;
- seller;
- trust;
- description;
- shipping/returns;
- size guide;
- Q&A;
- offer;
- price alert;
- recommendations;
- bundle;
- save/share;
- fullscreen;
- overflow;
- sticky transaction dock.

The biggest Phase 4 mistake would be to restyle each module individually. That keeps the inventory visible.

## 2. New content order

### Zone A — media
No overlay taxonomy if it can be below the media.

Controls:
- back;
- share;
- save;
- overflow.

Counter:
- gallery ≤5: dots can work;
- gallery >5: use `2 / 12` counter;
- don't show dots + counter + thumbnails simultaneously on phone.

### Zone B — identity
Order:
- brand/eyebrow;
- title;
- size/condition facts;
- price.

Price is strongest text after title but not a fintech number.

### Zone C — trust
One row:
- seller avatar/name;
- rating/sales/verification compressed;
- one action if needed.

Below:
max 3 trust facts:
- Buyer protection
- Dispatch expectation
- Returns/authentication as applicable

### Zone D — transaction
Sticky:
- Buy
- Offer if enabled.

No third same-weight CTA.

### Zone E — item facts
Description.
Measurements/details.
Condition detail.

### Zone F — buying facts
Delivery.
Returns.
Protection.
Payment accepted.

### Zone G — social proof
Q&A / reviews only if meaningful.

### Zone H — continuation
Related/More from seller.

---

## 3. Product cards to remove/flatten

Review every child that adds:
- border;
- background;
- radius;
- inner icon circle.

Convert many to:
- row;
- text;
- hairline;
- disclosure.

Likely flatten candidates:
- ShippingReturnsInfo;
- purchase-details summaries;
- condition explanations;
- simple trust facts.

Keep card containment for:
- bundle object;
- offer transaction object;
- media object;
- genuinely grouped protection exception.

---

## 4. Product media behavior

Thumbnail strip should not permanently reduce hero size on standard phone.

Use:
- swipe;
- page indicator;
- tap fullscreen.

Video:
- poster frame;
- tap play;
- mute default;
- no audio autoplay.

Fullscreen:
- black;
- pinch zoom images;
- native video controls/minimal custom;
- swipe down close if not conflicting.

---

# Part II — Sell

## 1. Current complexity

Sell has:
- photos/media draft queue;
- title;
- description;
- price/original price;
- brand;
- size;
- condition;
- category;
- tags;
- shipping;
- mode;
- auction fields;
- Co-Own fields;
- authenticity photos;
- autofill;
- sold comps;
- quality tips;
- photo guide;
- publish stages.

This is too much for one psychological step even if it is one scroll.

## 2. Reframe as progressive form

### Step/section 1 — Photos & video
This is visually dominant.

Grid:
- large Cover tile;
- smaller following items;
- Add tile.

Cover label:
small overlay.

Reorder:
drag.

Media-specific prompts:
- `Add a photo of the flaw`
- `Show the label`
- `Add the sole`
depending on category/condition.

Do not show generic photo-quality score.

### 2 — What is it?
- category;
- brand;
- title;
- size;
- condition.

Autofill suggestions appear as field value candidates.

### 3 — Describe it
Description.
Optional structured measurements.

### 4 — Price
Price input.
Suggested range if backed by sold comps:
`Similar sold: £58–£74 · 18 items`

Tap expands evidence.

### 5 — Delivery
Shipping method/payer.

### 6 — Format
If fixed sale is default, advanced formats are a choice:
`Sell now`
`Auction`
`Co-Own`

When selected, branch.

Do not load all Auction/Co-Own fields into the default visible form.

### 7 — Review
Preview object.
Unresolved checks.
Post.

---

## 3. Intelligent suggestion design

Never:
```
[AI AUTOFILL CARD]
We detected this may be Nike...
Apply AI
```

Use:
```
Brand
Nike                         Suggested
```

Tap accepts.
Editing is immediate.

Reason:
The system exists to reduce typing, not to create a second product voice.

---

## 4. Listing quality without gamification

Replace:
`Listing quality 78%`

with actionable checks.

Critical:
- missing category;
- no cover;
- invalid price;
- required condition.

Helpful:
- add more photos;
- add measurement;
- authenticity evidence.

Only unresolved checks appear.

After resolution, disappear.

---

# Part III — Checkout

## 1. Current state machine vs visible state

Backend/client may need:
- create order;
- intent;
- payment sheet;
- 3DS;
- polling;
- pending;
- settlement.

The user needs:
- Review
- Pay
- Confirm with bank
- Confirming
- Done / Pending / Failed

Do not mirror infrastructure labels into UI.

---

## 2. Checkout first viewport

```
Checkout
[item image] title
             seller

Delivery                  Address >
Payment                   Visa •••• >
-------------------------------------
Item                       £...
Delivery                   £...
Protection/fees            £...
Total                      £...

[ Pay £... ]
Buyer Protection applies
```

If breakdown is long:
show Total + one disclosure.

Wallet balance:
only show toggle if balance >0 and payment policy permits.

---

## 3. Payment trust

The Pay CTA label should contain the amount when stable:
`Pay £124.80`

If payment goes to bank/SCA:
`Confirm with your bank`

Do not say “Authenticating with provider” or “awaiting_payment.”

Pending:
`Payment is pending. We'll update this order when your bank confirms it.`

Give:
`View order`

not a permanent spinner.

---

# Cross-surface data quality loop

Sell's structured facts should improve:
- Search;
- Product;
- recommendation relevance;
- filters;
- trust.

Do not collect metadata that no downstream surface uses.

Create a schema usage audit:
| Field | Sell | Search | Product | Recommendation | Trust |
Every required seller field must have downstream justification.

---

# Screenshot sequence

## Product
- media hero;
- identity/trust;
- description;
- sticky Buy;
- offer sheet;
- sold state.

## Sell
- empty media;
- 3 photos;
- suggestion;
- luxury evidence;
- price comps;
- Auction branch;
- publish checks.

## Checkout
- normal;
- wallet;
- 3DS;
- pending;
- failure.

---

# Failure conditions

- default Sell shows Co-Own issuance detail before mode selection;
- Product first viewport contains 5 trust chips/badges;
- Product repeats buyer-protection info in multiple containers;
- Checkout displays backend stage terminology;
- quality is a decorative percentage;
- suggested values cannot be individually edited/rejected;
- listing metadata is requested without downstream use.
