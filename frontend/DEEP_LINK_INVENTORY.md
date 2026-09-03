# Deep Link Route Inventory

Comprehensive inventory of every deep-linkable route in the ThryftVerse app,
derived from `src/navigation/linking.ts` and `app.json`.

## URL prefixes

| Prefix | Type | Purpose |
|--------|------|---------|
| `thryftverse://` | Custom scheme | Internal flows (OAuth, push, invites) |
| `https://thryftverse.com` | Universal Link (iOS) / App Link (Android) | Public web URLs |
| `https://www.thryftverse.com` | Universal Link (iOS) / App Link (Android) | www variant |

## Server-side configuration

| Platform | File | URL |
|----------|------|-----|
| iOS | `apple-app-site-association` | `https://thryftverse.com/.well-known/apple-app-site-association` |
| Android | `assetlinks.json` | `https://thryftverse.com/.well-known/assetlinks.json` |

### iOS — `apple-app-site-association`

Must be served with `Content-Type: application/json` over HTTPS. The
`applinks` section must list both `thryftverse.com` and `www.thryftverse.com`
with the app ID `com.thryftverse.app`:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.com.thryftverse.app"],
        "components": [
          { "/": "/*" }
        ]
      }
    ]
  }
}
```

### Android — `assetlinks.json`

Must be served with `Content-Type: application/json` over HTTPS at
`.well-known/assetlinks.json` on both `thryftverse.com` and
`www.thryftverse.com`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.thryftverse.app",
      "sha256_cert_fingerprints": ["SHA256_OF_SIGNING_KEY"]
    }
  }
]
```

## Universal Links / App Links (`https://thryftverse.com/`)

### Home tab

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Home | `/home` | No | Web home |
| Look detail | `/looks/:lookId` | No | Web look |
| Galleria collection | `/galleria/collections/:collectionId` | No | Web collection |
| Moodboards | `/moodboards` | No | Web moodboards |
| Your Algorithm | `/algorithm` | No | Web algorithm |
| Style Quiz | `/style-quiz` | No | Web style quiz |

### Explore tab

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Explore | `/explore` | No | Web explore |
| Category detail | `/category/:categoryId` | No | Web category |
| Collection detail | `/collection/:collectionId` | No | Web collection |
| Saved searches | `/saved-searches` | Yes | Login → saved searches |
| Pulse feed | `/pulse` | No | Web pulse |
| Galleria | `/galleria` | No | Web galleria |
| Conversational search | `/ai-search` | No | Web AI search |

### Inbox tab

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Inbox | `/inbox` | Yes | Login → inbox |

### Profile tab

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Profile | `/me` | Yes | Login → profile |

### Marketplace / product (root stack)

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Item detail | `/product/:itemId` | No | Web listing |
| Checkout | `/checkout/:itemId` | Yes | Login → checkout |
| Global search | `/search` | No | Web search |

### Settings & account (root stack)

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Edit profile | `/me/edit` | Yes | Login → edit profile |
| Settings | `/settings` | Yes | Login → settings |
| Personalisation | `/personalisation` | Yes | Login → personalisation |
| Closet | `/closet` | Yes | Login → closet |
| Notifications | `/notifications` | Yes | Login → notifications |
| Saved addresses | `/addresses` | Yes | Login → addresses |
| Payments | `/payments` | Yes | Login → payments |
| Help & support | `/help` | No | Web help |
| Verification | `/verification` | Yes | Login → verification |
| Account security | `/account-security` | Yes | Login → account security |
| Account security recovery | `/account-security/recovery/:caseId` | Yes | Login → recovery |

### Auth

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Reset password | `/auth/reset-password` | No | Web reset password |

### Auctions

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Auction home | `/auctions` | No | Web auctions |
| Auction detail | `/auction/:auctionId` | No | Web auction |
| My bids | `/auctions/my-bids` | Yes | Login → my bids |

### Co-Own / syndicate

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Co-Own hub | `/co-own` | No | Web co-own |
| Asset detail | `/asset/:assetId` | No | Web asset |
| Asset due diligence | `/asset/:assetId/due-diligence` | No | Web due diligence |
| Portfolio | `/portfolio` | Yes | Login → portfolio |
| Co-Own order history | `/co-own/orders` | Yes | Login → orders |
| Market ledger | `/market` | No | Web market |
| Asset leaderboard | `/leaderboard` | No | Web leaderboard |

### Chat / social

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Chat | `/chat/:conversationId` | Yes | Login → chat |
| User profile | `/user/:userId` | No | Web profile |
| Bot directory | `/bots` | No | Web bots |
| Bot detail | `/bot/:botId` | No | Web bot |

### Orders & wallet

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Order detail | `/order/:orderId` | Yes | Login → order |
| Wallet | `/wallet` | Yes | Login → wallet |
| My orders | `/orders` | Yes | Login → orders |
| Balance history | `/wallet/balance` | Yes | Login → balance |
| Withdraw | `/wallet/withdraw` | Yes | Login → withdraw |
| Seller earnings | `/wallet/earnings` | Yes | Login → earnings |
| Wallet history | `/wallet/history` | Yes | Login → history |
| Wallet convert | `/wallet/convert` | Yes | Login → convert |
| Add bank account | `/wallet/bank-account` | Yes | Login → bank account |

### Agent ledger

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Agent ledger | `/agent-ledger` | Yes | Login → agent ledger |

### Seller tools

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Seller hub | `/seller-hub` | Yes | Login → seller hub |
| Seller analytics | `/seller-analytics` | Yes | Login → seller analytics |
| Creator analytics | `/creator-analytics` | Yes | Login → creator analytics |
| Inventory management | `/inventory` | Yes | Login → inventory |

### Support & help

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Resolution centre | `/resolution-centre` | Yes | Login → resolution centre |
| Support conversation | `/support/conversation/:conversationId` | Yes | Login → support |
| Support case detail | `/support/case/:caseId` | Yes | Login → support case |
| Order support | `/support/order/:orderId` | Yes | Login → order support |
| Invite friends | `/invite` | No | Web invite |
| Postage | `/postage` | No | Web postage |

### Moodboards

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Moodboard editor | `/moodboards/:moodboardId` | Yes | Login → moodboard |

### Live shopping

| Route | Path | Auth required | Fallback |
|-------|------|---------------|----------|
| Live shopping | `/live` | No | Web live |
| Live stream viewer | `/live/:sessionId` | No | Web live stream |

## Custom schemes (`thryftverse://`)

| Route | Path | Use case |
|-------|------|----------|
| OAuth callback | `/oauth/callback` | OAuth flow return |
| Group invite | `/group-invite/:token` | Group chat invite (handled manually in App.tsx) |
| Push notification | `/notification/:id` | Push tap deep link |
| Password reset | `/auth/reset-password?token=…` | Password reset email link |

## Legacy path rewrites

The following legacy paths are rewritten before parsing so external URLs
that reference removed routes still resolve:

| Legacy path | Converged path | Reason |
|-------------|----------------|--------|
| `wallet/activity` | `wallet/history` | WalletActivity → WalletHistory |
| `auctions/all` | `auctions` | Auctions → AuctionHome |

## Authentication-aware redirect logic

The `useDeepLinkAuth` hook (`src/hooks/useDeepLinkAuth.ts`) intercepts
incoming deep links and handles auth-gated routes:

1. Checks if the user is authenticated.
2. If not, stores the intended destination (path + params).
3. Redirects to `AuthLanding`.
4. After successful login, navigates to the stored destination.

Auth-required routes are identified by the `AUTH_REQUIRED_DEEP_LINK_ROUTES`
set in the hook. Routes not in that set are public and navigate directly.

## Testing checklist

- [ ] Cold start with deep link (app not running) — `/product/:id`
- [ ] Cold start with auth-required deep link (app not running) — `/chat/:id`
- [ ] Warm start with deep link (app in background) — `/product/:id`
- [ ] Warm start with auth-required deep link (app in background) — `/orders`
- [ ] Unauthenticated deep link to `/chat/:id` — redirects to login, then back
- [ ] Unauthenticated deep link to `/seller-hub` — redirects to login, then back
- [ ] Invalid deep link (`/nonexistent`) — graceful fallback to home
- [ ] Legacy deep link (`/wallet/activity`) — rewrites to `/wallet/history`
- [ ] Group invite (`thryftverse://group-invite/:token`) — joins and navigates
- [ ] Meta/TikTok in-app browser (strips URLs) — falls back to web
- [ ] iOS Universal Link from Safari — opens app, not browser
- [ ] Android App Link from Chrome — opens app, not browser
- [ ] AASA file served with correct Content-Type
- [ ] assetlinks.json served with correct SHA256 fingerprint
