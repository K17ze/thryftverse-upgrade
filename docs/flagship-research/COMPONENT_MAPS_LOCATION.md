# ThryftVerse Flagship Upgrade — Maps & Location

**Component deep-dive:** every map view, address form, address autocomplete, geolocation, and saved address management in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's address management uses: address autocomplete (Google Places) in the address form, saved addresses list with default shipping/billing flags, and a map preview showing the selected address. Local selling features use a map view with radius filtering ("within 10 miles"). eBay's lesson: **address autocomplete is the single highest-impact UX improvement for address entry — typing a full address manually is the 2020 pattern.**

### Instagram (2026)
Instagram's location features use: location picker with map view, search for places, and geolocation tagging on posts. The map is interactive (pan, zoom, tap pins). Instagram's lesson: **maps should be interactive, not static — the user expects to pan and zoom.**

### Cross-cutting 2026 consensus
- **Address autocomplete** (Google Places, Apple Maps, Mapbox) — type a few characters, select from suggestions.
- **Saved addresses** with default flags (shipping, billing) and edit/delete.
- **Map view** for location-based features (local selling, pickup).
- **Geolocation** via `expo-location` with permission UX.
- **`react-native-maps`** for map rendering on both platforms.
- **Address validation** — verify the address exists before accepting.

---

## 2. Psychology & Principles

### Typing fatigue
A full address (line 1, line 2, city, state, postal code, country) requires 5-6 text inputs. Address autocomplete reduces this to: type a few characters → select from suggestions → all fields auto-filled. This reduces typing fatigue and input errors (typos in postal codes, wrong city names).

### Location context
A map provides spatial context that a text address can't. The user sees where the address is relative to landmarks, roads, and other addresses. For local selling ("pickup within 10 miles"), the map is essential — the user needs to see the radius, not just read "within 10 miles."

### Permission as trust
Location permission is sensitive — the user is sharing their physical location. The permission request must explain why ("To show items near you" or "To autofill your address") before the system prompt. Per AGENTS.md: no permission without explanation.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Map/location files (11 files matched)

| File | Description | Map | Autocomplete |
|------|-------------|-----|--------------|
| `screens/SavedAddressesScreen.tsx` | Saved addresses list | ❌ No map | ❌ No autocomplete |
| `screens/AddressFormScreen.tsx` | Manual address form | ❌ No map | ❌ No autocomplete |
| `screens/CheckoutScreen.tsx` | Checkout address selection | ❌ No map | ❌ No autocomplete |
| `screens/PostageScreen.tsx` | Postage/carrier selection | ❌ | ❌ |
| `screens/SettingsScreen.tsx` | Settings link to addresses | ❌ | ❌ |
| `store/useStore.ts` | Address state (5 references) | N/A | N/A |
| `utils/checkoutFlow.ts` | Checkout flow logic | N/A | N/A |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No map view** — `react-native-maps` not installed | Global | High |
| 2 | **No address autocomplete** — manual text entry only | `AddressFormScreen.tsx` | High |
| 3 | **No geolocation** — `expo-location` not used | Global | Medium |
| 4 | **No address validation** — accepts any text | `AddressFormScreen.tsx` | Medium |
| 5 | **No map preview** on saved addresses | `SavedAddressesScreen.tsx` | Low |
| 6 | **No local selling / pickup** features | Global | Low |
| 7 | **Manual address entry** — 5-6 text inputs, no autocomplete | `AddressFormScreen.tsx:148, 407, 425, 433` | High |
| 8 | **No Google Places / Apple Maps integration** | package.json | High |

---

## 4. Micro Improvements

### M1 — Install map and location libraries
Add `react-native-maps`, `expo-location`, and `react-native-google-places-autocomplete` (or equivalent).

### M2 — Add address autocomplete to AddressFormScreen
Replace manual text inputs with an autocomplete search bar. As the user types, show address suggestions from Google Places. On selection, auto-fill all address fields.

### M3 — Add map preview to SavedAddressesScreen
Show a small static map preview next to each saved address, with a pin at the address location.

### M4 — Add address validation
Before saving an address, validate it against Google Places API. Reject invalid addresses with a clear error message.

### M5 — Add geolocation with permission UX
Add a "Use current location" button on the address form. Request location permission with a pre-prompt explaining why. On permission, fill the address from the device's GPS coordinates.

### M6 — Add default address flags
Allow users to set a default shipping address and default billing address. Show default badges in the saved addresses list.

---

## 5. Macro Improvements

### A1 — Address management system
Create a unified address system:
- `AddressAutocomplete` — search bar with Google Places suggestions
- `AddressForm` — auto-filled from autocomplete, with manual edit fallback
- `SavedAddressesList` — list with default flags, map previews, edit/delete
- `AddressPicker` — bottom sheet for selecting a saved address during checkout
- `MapPreview` — small static map with pin

### A2 — Location-based features (future)
- **Local selling:** filter listings by distance ("within 10 miles")
- **Pickup option:** buyers can pick up items locally instead of shipping
- **Location-based discovery:** show listings near the user's location

---

## 6. Flagship Acceptance Criteria

- **Address autocomplete** on all address entry forms
- **Map preview** on saved addresses
- **Address validation** before saving
- **Geolocation** with permission UX ("Use current location")
- **Default address flags** (shipping, billing)
- **Saved address management** (add, edit, delete, set default)
- **`react-native-maps`** installed for map rendering
- **Accessibility** — map with accessibility label, address form with proper labels

### Thumbnail test
At 25% scale, an address form with autocomplete must show: the search bar (dominant), the suggestion list (below), and the auto-filled fields. A saved address card must show: the address text, the default badge, and the map preview thumbnail.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Install map/location libraries | Low | All location features |
| P0 | M2 — Address autocomplete | Medium | Address UX |
| P1 | M4 — Address validation | Medium | Data quality |
| P1 | M5 — Geolocation with permission | Medium | UX convenience |
| P2 | M3 — Map preview on saved addresses | Low | Visual context |
| P2 | M6 — Default address flags | Low | Checkout UX |
| P3 | A1 — Full address system | High | All address surfaces |
| P3 | A2 — Location-based features | High | Local selling |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `map.provider` | react-native-maps | Both platforms |
| `map.defaultZoom` | 15 | Address-level |
| `map.pinColor` | colors.brand | |
| `map.previewSize` | 72pt | Thumbnail |
| `map.previewRadius` | Radius.md | |
| `autocomplete.provider` | Google Places | Or Apple Maps |
| `autocomplete.suggestionHeight` | 48pt | Tappable |
| `autocomplete.maxSuggestions` | 5 | Visible |
| `address.fieldHeight` | 48pt | Control.touchable |
| `address.defaultBadgeColor` | colors.brand | |
| `geolocation.permissionText` | "Use your location to autofill your address" | Pre-prompt |

---

*Generated 2026-08-18. Sources: production codebase audit, eBay address management patterns, react-native-maps docs, Google Places Autocomplete docs.*
