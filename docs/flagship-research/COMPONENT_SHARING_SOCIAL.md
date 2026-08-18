# ThryftVerse Flagship Upgrade — Sharing & Social Actions

**Component deep-dive:** every share sheet, share button, copy-link, share-to-story, and shareable card in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram's sharing is built on share-to-story: a user can share a post to their Instagram Story with one tap, with the post rendered as a sticker on a story background. The recipient taps the sticker and deep-links to the original post. Instagram's lesson: **share-to-story is the highest-conversion viral loop for visual content.**

### Snapchat (2026)
Snapchat's sharing is built on share-to-chat: a user sends a snap or story to a friend, who opens it in the app. The shared content deep-links back to the original. Snapchat's lesson: **share-to-chat is the peer-to-peer viral loop — friends share with friends, who open in the app.**

### eBay (2026)
eBay's listing sharing uses a share sheet with: copy link, share to WhatsApp, share to email, share to Facebook. The shared link is a universal link that opens the eBay app on the listing. eBay's lesson: **every shareable object must have a deep link that opens the app, not a browser.**

### Cross-cutting 2026 consensus
- **Share-to-story** (Instagram, Snapchat) — highest conversion for visual content.
- **Share-to-chat** (WhatsApp, iMessage) — peer-to-peer viral loop.
- **Copy link** with clipboard + toast confirmation.
- **Shareable card images** — generated image with product photo + price + brand + deep link QR, 5-10× higher CTR than text-only.
- **Universal links / app links** — shared link opens the app, not the browser.
- **`react-native-view-shot`** for capturing styled cards as shareable images.

---

## 2. Psychology & Principles

### The viral loop
Sharing is the viral loop: user A shares → user B receives → user B opens the app → user B becomes a user. The loop is broken if: (1) the share is text-only (low CTR), (2) the link opens a browser (not the app), or (3) the recipient can't see what was shared without opening the link. The 2026 standard: shareable card image + deep link = complete viral loop.

### Image shares vs text shares
Image shares have 5-10× higher CTR than text-only shares because the image is a preview — the recipient sees the product before tapping. A text-only share ("Check out this listing on Thryftverse!") gives the recipient no reason to tap. An image share (product photo + price + "Available on Thryftverse") gives the recipient a reason to tap.

### Copy link as the universal fallback
Copy link is the universal fallback — it works everywhere (any chat app, any social platform, email, SMS). The toast confirmation ("Link copied") tells the user the copy succeeded. The copied link must be a universal link that opens the app.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Share-related files (18 files with Share.share or Clipboard)

| File | Share Method | Deep Link | Image |
|------|-------------|-----------|-------|
| `components/ShareSheet.tsx` (7.8KB) | Share.share | ❌ No universal link | ❌ Text-only |
| `screens/InviteFriendsScreen.tsx` | Share.share + copy | ❌ Opens browser | ❌ Text-only |
| `screens/UserProfileScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/PosterViewerScreen.tsx` | Share.share (5 calls) | ❌ | ❌ |
| `screens/ChatScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/OrderDetailScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/OrderReceiptScreen.tsx` | Share.share + copy | ❌ | ❌ |
| `screens/LookDetailScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/MyProfileScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/ListingSuccessScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/ManageListingScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/LiveStreamViewerScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/ClosetScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/GroupChatInfoScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/OutfitBuilderScreen.tsx` | Share.share | ❌ | ❌ |
| `screens/TwoFactorSetupScreen.tsx` | Clipboard (copy codes) | N/A | N/A |
| `screens/CoOwnTaxDocumentsScreen.tsx` | Share.share | ❌ | ❌ |
| `creator/CreatorContext.tsx` | Share.share | ❌ | ❌ |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No share-to-story** — can't share to Instagram Stories or Snapchat | Global | Critical |
| 2 | **No shareable card images** — all shares are text-only via `Share.share` | All 18 files | Critical |
| 3 | **No universal links** — shared links open browser, not the app (per Report #27) | All shares | Critical |
| 4 | **No `react-native-view-shot`** for capturing shareable cards | package.json | High |
| 5 | **18 screens call `Share.share` directly** — no shared share component | 18 files | Medium |
| 6 | **ShareSheet.tsx exists but is only used in 1-2 places** | Most screens bypass it | Medium |
| 7 | **No deep link generation** — shared URLs are plain URLs, not app deep links | All shares | High |
| 8 | **No share analytics** — can't track share → install → purchase attribution | Global | Medium |

---

## 4. Micro Improvements

### M1 — Add share-to-story
Use `expo-sharing` or `react-native-share` to share listing images to Instagram Stories and Snapchat. Generate a shareable card image first (M2), then share the image to stories.

### M2 — Generate shareable card images
Use `react-native-view-shot` to capture a styled card:
- Listing photo (square, 80% of card)
- Price overlay
- Brand name
- "Available on Thryftverse" badge
- Deep link QR code (optional)

Share the captured image via `Share.share` with the image as an attachment.

### M3 — Fix deep links (per Report #27)
Host `apple-app-site-association` and `assetlinks.json`. Add `NavigationContainer` `linking` prop to route shared URLs to the app. Every shared URL (`https://thryftverse.app/listing/:id`, `/invite/:code`, `/user/:id`) opens the app.

### M4 — Create unified ShareButton component
```tsx
interface ShareButtonProps {
  type: 'listing' | 'profile' | 'look' | 'invite' | 'receipt';
  id: string;
  title?: string;
  imageUri?: string;
  deepLinkPath: string;
}
```
Renders a share icon button. On press: generates shareable card (if image available), builds deep link, opens `Share.share` with image + text + URL.

### M5 — Replace all inline `Share.share` calls with ShareButton
Migrate all 18 screens to use the shared `ShareButton` component.

### M6 — Add share analytics
Track share events: `share_initiated` (type, id), `share_completed` (platform), `share_link_opened` (deep link opened by recipient). This feeds the viral coefficient calculation (per Report #30).

---

## 5. Macro Improvements

### A1 — Sharing as a viral loop system
The architecture:
1. **ShareButton** on every shareable object (listing, profile, look, invite, receipt)
2. **Card generation** via `react-native-view-shot` — styled card with photo + price + brand + deep link
3. **Share targets:** ShareSheet (native), share-to-story (Instagram, Snapchat), share-to-chat (WhatsApp, iMessage), copy link
4. **Deep link** — universal link that opens the app to the shared object
5. **Analytics** — share → open → signup → purchase attribution

### A2 — Shareable card templates
Create card templates for each share type:
- **Listing card:** product photo + price + brand + "Shop on Thryftverse"
- **Profile cards:** avatar + name + bio + "Follow on Thryftverse"
- **Look cards:** look photo + creator name + "Discover on Thryftverse"
- **Invite cards:** referral code + "Join Thryftverse — get £10 off"
- **Receipt cards:** order summary + "Sold on Thryftverse" (for seller sharing)

---

## 6. Flagship Acceptance Criteria

- **Share-to-story** on Instagram Stories and Snapchat
- **Shareable card images** generated via `react-native-view-shot`
- **Universal links** — shared links open the app, not the browser
- **Unified ShareButton** component on all shareable objects
- **Copy link** with toast confirmation
- **Share analytics** — share → open → signup → purchase tracking
- **No text-only shares** — every share includes an image card

### Thumbnail test
At 25% scale, a shareable card image must show: the product photo (dominant), the price (legible), and the "Thryftverse" brand badge. The card must look like a social media share card, not a screenshot.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M3 — Fix deep links | Low (per Report #27) | Viral loop |
| P0 | M2 — Shareable card images | Medium | Share CTR |
| P0 | M1 — Share-to-story | Medium | Viral coefficient |
| P1 | M4 — Unified ShareButton | Medium | Consistency |
| P1 | M5 — Replace inline Share.share | Low | Maintainability |
| P2 | M6 — Share analytics | Medium | Viral tracking |
| P3 | A1 — Full viral loop system | High | Sustainable growth |
| P3 | A2 — Card templates | Medium | All share types |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `share.card.width` | 1080px | Social media standard |
| `share.card.height` | 1920px | Story format |
| `share.card.photoRatio` | 1:1 (square) | Product focus |
| `share.card.padding` | 80px | Breathing room |
| `share.card.brandBadge` | "Available on Thryftverse" | Brand text |
| `share.card.qrCode` | Optional, bottom-right | Deep link QR |
| `share.deepLink.scheme` | `https://thryftverse.app` | Universal link |
| `share.deepLink.paths` | /listing/:id, /user/:id, /invite/:code, /look/:id | Routes |
| `share.targets` | system (ShareSheet), instagram-stories, snapchat, whatsapp, imessage, copy | Multiple |
| `share.haptic` | selection on press | |
| `share.copyToast` | "Link copied" + 2s duration | Confirmation |

---

*Generated 2026-08-18. Sources: production codebase audit, Instagram share-to-story patterns, Snapchat share-to-chat patterns, eBay listing share patterns, react-native-view-shot docs.*
