# Sources + Audit Trail

# Repository evidence inspected

- `Design.md`
- `frontend/src/components/flagship/FlagshipFormSection.tsx`
- `frontend/src/components/ui/PremiumTextField.tsx`
- `frontend/src/components/ui/AppInput.tsx`
- `frontend/src/screens/ManageListingScreen.tsx`
- `frontend/src/screens/ChangePasswordScreen.tsx`
- `frontend/src/screens/AssetDetailScreen.tsx`
- `frontend/src/screens/CreateGroupChatScreen.tsx`
- `frontend/src/services/profileApi.ts`
- `frontend/src/screens/SellerHubScreen.tsx`
- `frontend/src/screens/MyProfileScreen.tsx`
- `frontend/src/components/profile/MyProfileTabRail.tsx`
- `frontend/src/screens/SellScreen.tsx`
- `backend/api/src/` and route directory
- static search for `borderWidth: StyleSheet.hairlineWidth`
- static search for `borderWidth: Stroke.standard`
- static search for `/users/search`

# External research

## Apple
- https://developer.apple.com/wwdc26/guides/design/
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/design/human-interface-guidelines/search-fields
- https://developer.apple.com/design/human-interface-guidelines/searching

## Google / Material
- https://m3.material.io/
- https://design.google/library/expressive-material-design-google-research
- https://developer.android.com/develop/ui/compose/designsystems/material3

## Baymard
- https://baymard.com/blog/current-state-ecommerce-product-page-ux
- https://baymard.com/blog/mobile-ux-ecommerce
- https://baymard.com/blog/mobile-app-ux-trends
- https://baymard.com/blog/checkout-flow-average-form-fields
- https://baymard.com/blog/collections/mobile
- https://baymard.com/blog/collections/product-page

## eBay
- https://www.ebay.com/help/Selling/Selling_Tools/Seller_Hub?id=4095
- https://www.ebay.com/help/selling/shipping-items/setting-shipping-options/ebay-shipping?id=4089
- https://www.ebay.com/help/Selling/-/Business_policies?id=4212

## Vinted
- https://www.vinted.co.uk/help/4/234-metodi-di-spedizione

## Pinterest
- https://help.pinterest.com/en-gb/business/article/create-a-board
- https://help.pinterest.com/en/article/boards

# Evidence caveat

This is code-backed and research-backed. Static source review can identify architecture, hierarchy, truth and likely visual defects; it cannot honestly certify optical parity without rendered native screenshots. Native screenshot review is therefore a blocking release artifact rather than an optional final flourish.
