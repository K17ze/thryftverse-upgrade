# Engineering Decomposition, Performance & State

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Architecture directly affects visual quality

Very large screen files accumulate conditionals, stale closures and duplicated state. That makes optical polish risky because each visual change can break behavior.

## Creator

Split top-level product controllers:
- Poster Composer
- Look Composer

Share:
- document engine
- renderer
- media pipeline
- history
- publish contract
- selected low-level tools.

## Chat

Split controller hooks from render.

`ChatScreen` should compose domains, not implement all of them.

## Wallet

Split:
- WalletHome
- AddMoney
- Convert
- Withdraw
- Earnings
- Activity.

## Agents

Layers:
1. UI
2. application service
3. runtime adapter
4. capability broker
5. secret vault
6. event/activity store.

Provider-specific logic never belongs in screen components.

## Shared server state

- Asset Detail and Due Diligence share one cached asset truth.
- owner/public Profile projections have distinct query keys/contracts.
- agent event streams support cursor/resume.
- wallet refresh completion reflects actual request completion.

## Identifiers

Replace persisted `Date.now()+Math.random()` IDs with canonical crypto UUID/ULID helper.

## Performance gates

Measure release builds, p50 and p95:
- app cold start
- Home first content
- camera ready
- gallery thumbnails
- Poster first interactive
- Look first interactive
- Chat latest message
- Wallet cached balance
- Co-Own media visible
- agent connection verified
- agent first runtime event/token.

## Frame quality

- continuous gestures remain UI-thread;
- pause offscreen video;
- prefetch next Poster frame;
- cap media memory;
- no full-document serialization on every drag frame;
- use stable callbacks for virtualized lists.

## Error boundaries

One media callback failure must not recreate unrelated Browse/Profile navigation trees.
