# August 2026 Research North Star

## Apple 2026

WWDC26 design guidance emphasizes content, consistency, readability, accessibility and adaptive layouts. Liquid Glass is described as a functional navigation/control layer rather than something to spread through the content layer. Search guidance updated in June 2026 recommends useful placeholder text, immediate refinement while typing when possible, relevant suggestions/results, and inline search located directly above the content it filters.

**Implementation consequence:** “premium” means editing and hierarchy, not more chrome. Search must work continuously, not merely look like search.

Sources:
- https://developer.apple.com/wwdc26/guides/design/
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/design/human-interface-guidelines/search-fields
- https://developer.apple.com/design/human-interface-guidelines/searching

## Material 3 Expressive / Google

Current Material 3 Expressive emphasizes adaptive components, flexible typography, contrasting shape, meaningful motion physics and emotional expression. Google’s design research frames expression as a way to improve attention, comprehension and desirability — not a license to decorate every surface.

**Implementation consequence:** the answer to “prototype-like” is stronger focal hierarchy and product-specific hero moments, not more rounded rectangles.

Sources:
- https://m3.material.io/
- https://design.google/library/expressive-material-design-google-research
- https://developer.android.com/develop/ui/compose/designsystems/material3

## Baymard 2026

Baymard’s current product-page benchmark says 62% of mobile product pages and 64% of ecommerce apps are “mediocre or worse.” Their research repeatedly shows that the accumulation of medium-level usability defects can damage an experience even when no single issue is catastrophic. Current mobile research also emphasizes that perceived effort matters more than merely counting steps.

**Implementation consequence:** ThryftVerse’s remaining gap is cumulative: borders, weak grouping, optional fields, ambiguous state, fake controls, and dense screens add up to a non-flagship impression.

Sources:
- https://baymard.com/blog/current-state-ecommerce-product-page-ux
- https://baymard.com/blog/mobile-ux-ecommerce
- https://baymard.com/blog/mobile-app-ux-trends
- https://baymard.com/blog/checkout-flow-average-form-fields

## Seller operations / shipping

Current eBay Seller Hub is centered on operational state: tasks, orders, listings, performance, payouts/payments, store, marketing and reports. Current eBay shipping setup uses package size to recommend services and then asks who pays. Business policies allow reusable shipping/payment/returns templates. Current Vinted UK integrated shipping lets buyers select among seller-enabled providers and gives sellers prepaid labels.

**Implementation consequence:** Seller Hub should answer “what needs me now?” Shipping should infer/recommend a real service outcome and allow policy reuse.

Sources:
- https://www.ebay.com/help/Selling/Selling_Tools/Seller_Hub?id=4095
- https://www.ebay.com/help/selling/shipping-items/setting-shipping-options/ebay-shipping?id=4089
- https://www.ebay.com/help/Selling/-/Business_policies?id=4212
- https://www.vinted.co.uk/help/4/234-metodi-di-spedizione

## Saved vs authored profile content

Pinterest’s board model illustrates that saved/collected content is its own collection behavior with public/private control. It is psychologically different from authored identity content.

**ThryftVerse consequence:**
- Listings = authored commerce.
- Looks = authored creative identity.
- Saved = private consumption/intent.
- About = identity metadata.

Sources:
- https://help.pinterest.com/en-gb/business/article/create-a-board
- https://help.pinterest.com/en/article/boards

# Psychology → code rules

### Salience is scarce
One dominant object/action per viewport. If five cards are equally outlined, none has hierarchy.

### Proximity before borders
Group using:
1. proximity;
2. alignment;
3. type;
4. tonal contrast;
5. divider;
6. border only for a true object boundary.

### Borders must carry meaning
Good reasons: field, focus, selection, state, table, transaction, document, modal.  
Bad reason: “this is a section.”

### Progressive disclosure is trust
For Co-Own, show comprehension first and market microstructure later.

### Recognition beats abstract configuration
“Small parcel · 2–4 days · £3.49” is more actionable than “Standard.”

### Perceived effort is a design variable
Use defaults, recommendations, saved policies and conditional advanced fields.

### Premium comes from editing
Every element should earn its space, icon, border, label and surface.

### Motion explains state
Use motion for spatial continuity and state transitions, not entrance animation on every card.

## North-star sentence

> ThryftVerse should feel content-led like a social product, operationally truthful like a marketplace, progressively deep like a financial product, and visually edited like a premium native app.
