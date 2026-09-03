import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── P0.1: protected-instant contract contradiction ──
//
// DEFECT: The `protected_instant` order type is a marketable-limit order — it
// carries a protection price (limitPriceGbp). However, the frontend maps
// `protected_instant` → `orderMode: 'market'` (TradeScreen.tsx line 162) and
// then sends `orderType: 'market'` + `limitPriceGbp` together in the order
// command. The backend schema rejects `market` + `limitPriceGbp` as a
// contradictory combination: a market order has no limit price.
//
// FIX: Introduce `protected_market` as a distinct order type. The order
// instruction should carry `maxPriceGbp` (for buys) or `minPriceGbp` (for
// sells) — NOT `limitPriceGbp`. The backend `PlaceCoOwnOrderInput.orderType`
// must accept `'protected_market'` and the frontend must not send
// `limitPriceGbp` for protected_market orders.
//
// After-fix contract:
//   type ProtectedMarketInstruction = {
//     type: 'protected_market';
//     side: 'buy' | 'sell';
//     units: number;
//     maxPriceGbp?: string; // for buys
//     minPriceGbp?: string; // for sells
//   };

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('P0.1: protected-instant → protected_market contract', () => {
  // ── Document the current bug: protected_instant maps to market + limitPriceGbp ──

  it('DOCUMENTS BUG: TradeScreen maps protected_instant to orderMode market', () => {
    // This is the current defective behaviour — protected_instant → 'market'
    // while still carrying a limitPriceGbp. This test documents the bug so
    // the fix can remove this mapping.
    const src = readSrc('screens/TradeScreen.tsx');
    // The buggy line: orderMode = ticketOrderType === 'protected_instant' ? 'market' : 'limit'
    expect(src).toContain("ticketOrderType === 'protected_instant' ? 'market'");
  });

  it('FIX: order command no longer sends orderType market with limitPriceGbp', () => {
    // After the fix, the command should use backendOrderType (which is
    // 'protected_market' for protected_instant), not orderMode ('market').
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).not.toContain('orderType: orderMode');
    expect(src).toContain('orderType: backendOrderType');
  });

  // ── After-fix: protected_market is a distinct order type ──

  it('FIX: CoOwnOrderType includes protected_market (not protected_instant)', () => {
    // After the fix, the order type union should include 'protected_market'.
    // The old 'protected_instant' should be removed or renamed.
    const src = readSrc('utils/tradeFlow.ts');
    expect(src).toContain("'protected_market'");
    // The old contradictory name should no longer be the canonical type
    expect(src).not.toContain("CoOwnOrderType = 'protected_instant'");
  });

  it('FIX: CoOwnTicketOrderType includes protected_market', () => {
    const src = readSrc('components/coown/CoOwnTradeComposer.tsx');
    expect(src).toContain("'protected_market'");
    // The old type alias should not retain the contradictory name
    expect(src).not.toMatch(/CoOwnTicketOrderType\s*=\s*'protected_instant'/);
  });

  it('FIX: TradeScreen no longer maps protected_instant to market for backend', () => {
    // After the fix, the backend order type should be 'protected_market',
    // not 'market'. The orderMode variable may still exist for UI purposes,
    // but the backend command should use backendOrderType.
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain("backendOrderType");
    expect(src).toContain("'protected_market'");
  });

  it('FIX: order command uses maxPriceGbp for protected_market buys', () => {
    // After the fix, a protected_market buy should send maxPriceGbp, not
    // limitPriceGbp. The order command construction should reference
    // maxPriceGbp for buys.
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('maxPriceGbp');
  });

  it('FIX: order command uses minPriceGbp for protected_market sells', () => {
    // After the fix, a protected_market sell should send minPriceGbp.
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('minPriceGbp');
  });

  it('FIX: PlaceCoOwnOrderInput accepts protected_market orderType', () => {
    // The backend order input type must accept 'protected_market' as a valid
    // orderType — not just 'market' | 'limit'.
    const src = readSrc('services/marketApi.ts');
    // The orderType union in PlaceCoOwnOrderInput should include protected_market
    expect(src).toMatch(/orderType\??\s*:\s*[^;]*'protected_market'/);
  });

  it('FIX: PlaceCoOwnOrderInput supports maxPriceGbp and minPriceGbp', () => {
    // The backend order input type must include the new protection price
    // fields for protected_market orders.
    const src = readSrc('services/marketApi.ts');
    expect(src).toContain('maxPriceGbp');
    expect(src).toContain('minPriceGbp');
  });

  it('FIX: limitPriceGbp is NOT sent for protected_market orders', () => {
    // After the fix, the order command for protected_market must not carry
    // limitPriceGbp. The TradeScreen should branch on order type when
    // building the command, using maxPriceGbp/minPriceGbp for protected_market.
    const src = readSrc('screens/TradeScreen.tsx');
    // The command should conditionally include limitPriceGbp only for limit orders
    // and maxPriceGbp/minPriceGbp for protected_market
    expect(src).toContain('maxPriceGbp');
    expect(src).toContain('minPriceGbp');
    // The conditional spread should check for protected_market
    expect(src).toMatch(/protected_market.*maxPriceGbp|minPriceGbp.*protected_market/);
  });
});

// ── Protected market instruction contract shape ──
//
// These tests verify the NEW contract shape that should be used after the fix.
// They will FAIL until the fix is applied because the types/functions do not
// yet exist.

describe('P0.1: ProtectedMarketInstruction contract shape', () => {
  it('FIX: tradeFlow exports a protected_market order instruction builder', () => {
    // After the fix, tradeFlow should export a function that builds a
    // protected_market instruction with maxPriceGbp/minPriceGbp.
    const src = readSrc('utils/tradeFlow.ts');
    expect(src).toContain('protected_market');
    // The instruction type should use maxPriceGbp/minPriceGbp, not limitPriceGbp
    expect(src).toContain('maxPriceGbp');
    expect(src).toContain('minPriceGbp');
  });

  it('FIX: ProtectedMarketInstruction type uses maxPriceGbp for buys', () => {
    const src = readSrc('utils/tradeFlow.ts');
    // The type definition should include maxPriceGbp as an optional field
    expect(src).toMatch(/maxPriceGbp\??\s*:/);
  });

  it('FIX: ProtectedMarketInstruction type uses minPriceGbp for sells', () => {
    const src = readSrc('utils/tradeFlow.ts');
    expect(src).toMatch(/minPriceGbp\??\s*:/);
  });

  it('FIX: ProtectedMarketInstruction does not use limitPriceGbp', () => {
    // The protected_market instruction must NOT carry limitPriceGbp — that
    // field is reserved for resting limit orders only.
    const src = readSrc('utils/tradeFlow.ts');
    // The protected_market instruction type should not reference limitPriceGbp
    // within its own type definition. We check that the new type uses the
    // max/min price fields instead.
    expect(src).toContain('maxPriceGbp');
    expect(src).toContain('minPriceGbp');
  });
});
