import { describe, expect, it } from 'vitest';

// ── Pure in-memory matching engine model ──────────────────────────────
// Mirrors the actual matching logic from the order placement route:
// - Price-time priority (best price first, FIFO within level)
// - Self-trade prevention (skip own orders)
// - GTC/IOC/FOK time-in-force
// - Balance conservation

type Side = 'buy' | 'sell';
type TIF = 'GTC' | 'IOC' | 'FOK';
type OrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled';

interface ModelOrder {
  id: string;
  userId: string;
  side: Side;
  price: number; // in pence (minor units)
  units: number;
  filledUnits: number;
  status: OrderStatus;
  tif: TIF;
  timestamp: number; // logical timestamp for time priority
}

interface Trade {
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  units: number;
}

class MatchingEngine {
  private orders: Map<string, ModelOrder> = new Map();
  private trades: Trade[] = [];
  private logicalTime = 0;

  placeOrder(
    userId: string,
    side: Side,
    price: number,
    units: number,
    tif: TIF = 'GTC'
  ): { orderId: string; trades: Trade[]; status: OrderStatus } {
    this.logicalTime++;
    const orderId = `ord-${this.orders.size + 1}`;
    const order: ModelOrder = {
      id: orderId,
      userId,
      side,
      price,
      units,
      filledUnits: 0,
      status: 'open',
      tif,
      timestamp: this.logicalTime,
    };

    // FOK: check if entire order can be filled at the price
    if (tif === 'FOK') {
      const available = this.findAvailableDepth(side, price, userId);
      if (available < units) {
        return { orderId, trades: [], status: 'cancelled' };
      }
    }

    const executedTrades: Trade[] = [];
    const oppositeSide: Side = side === 'buy' ? 'sell' : 'buy';

    // Walk opposite book in price-time priority
    const candidates = this.getOppositeOrders(oppositeSide, price, side, userId);

    let remaining = units;
    for (const opp of candidates) {
      if (remaining <= 0) break;

      const fillUnits = Math.min(remaining, opp.units - opp.filledUnits);
      if (fillUnits <= 0) continue;

      // Execute trade
      const trade: Trade = {
        buyOrderId: side === 'buy' ? orderId : opp.id,
        sellOrderId: side === 'sell' ? orderId : opp.id,
        buyerId: side === 'buy' ? userId : opp.userId,
        sellerId: side === 'sell' ? userId : opp.userId,
        price: opp.price, // trade at resting order's price
        units: fillUnits,
      };
      executedTrades.push(trade);
      this.trades.push(trade);

      opp.filledUnits += fillUnits;
      if (opp.filledUnits >= opp.units) {
        opp.status = 'filled';
      } else {
        opp.status = 'partially_filled';
      }

      order.filledUnits += fillUnits;
      remaining -= fillUnits;
    }

    // Determine order status
    if (order.filledUnits === 0) {
      order.status = tif === 'IOC' || tif === 'FOK' ? 'cancelled' : 'open';
    } else if (order.filledUnits >= units) {
      order.status = 'filled';
    } else {
      order.status = tif === 'IOC' || tif === 'FOK' ? 'cancelled' : 'partially_filled';
    }

    // Rest unfilled GTC portion on book
    if (order.status === 'open' || order.status === 'partially_filled') {
      this.orders.set(orderId, order);
    }

    return { orderId, trades: executedTrades, status: order.status };
  }

  private findAvailableDepth(side: Side, price: number, userId: string): number {
    const oppositeSide: Side = side === 'buy' ? 'sell' : 'buy';
    const candidates = this.getOppositeOrders(oppositeSide, price, side, userId);
    return candidates.reduce((sum, o) => sum + (o.units - o.filledUnits), 0);
  }

  private getOppositeOrders(
    oppositeSide: Side,
    limitPrice: number,
    incomingSide: Side,
    incomingUserId: string
  ): ModelOrder[] {
    // Get all open/partially_filled opposite orders
    let candidates = Array.from(this.orders.values()).filter(
      o => o.side === oppositeSide &&
           (o.status === 'open' || o.status === 'partially_filled') &&
           o.userId !== incomingUserId // STP: skip own orders
    );

    // Filter by price crossing
    if (incomingSide === 'buy') {
      // Buy at limitPrice → match sells at price <= limitPrice
      candidates = candidates.filter(o => o.price <= limitPrice);
      // Sort: lowest sell price first (best for buyer), then FIFO
      candidates.sort((a, b) => a.price - b.price || a.timestamp - b.timestamp);
    } else {
      // Sell at limitPrice → match buys at price >= limitPrice
      candidates = candidates.filter(o => o.price >= limitPrice);
      // Sort: highest buy price first (best for seller), then FIFO
      candidates.sort((a, b) => b.price - a.price || a.timestamp - b.timestamp);
    }

    return candidates;
  }

  getTrades(): Trade[] {
    return [...this.trades];
  }

  getOpenOrders(): ModelOrder[] {
    return Array.from(this.orders.values()).filter(
      o => o.status === 'open' || o.status === 'partially_filled'
    );
  }
}

// ── Property Tests ────────────────────────────────────────────────────

describe('Phase 3: Matching engine property tests', () => {
  describe('Price-time priority', () => {
    it('best price executes first (sell side)', () => {
      const engine = new MatchingEngine();
      // Three sell orders at different prices
      engine.placeOrder('seller1', 'sell', 100, 10, 'GTC');
      engine.placeOrder('seller2', 'sell', 98, 10, 'GTC');
      engine.placeOrder('seller3', 'sell', 99, 10, 'GTC');

      // Buy at 101 — should match lowest sell first (98)
      const result = engine.placeOrder('buyer', 'buy', 101, 25, 'GTC');
      expect(result.status).toBe('filled');
      expect(result.trades).toHaveLength(3);

      // First trade at 98 (best price for buyer)
      expect(result.trades[0].price).toBe(98);
      // Second trade at 99
      expect(result.trades[1].price).toBe(99);
      // Third trade at 100
      expect(result.trades[2].price).toBe(100);
    });

    it('best price executes first (buy side)', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('buyer1', 'buy', 100, 10, 'GTC');
      engine.placeOrder('buyer2', 'buy', 102, 10, 'GTC');
      engine.placeOrder('buyer3', 'buy', 101, 10, 'GTC');

      // Sell at 99 — should match highest buy first (102)
      const result = engine.placeOrder('seller', 'sell', 99, 25, 'GTC');
      expect(result.status).toBe('filled');
      expect(result.trades).toHaveLength(3);

      expect(result.trades[0].price).toBe(102);
      expect(result.trades[1].price).toBe(101);
      expect(result.trades[2].price).toBe(100);
    });

    it('FIFO within same price level', () => {
      const engine = new MatchingEngine();
      // Two sell orders at same price — first one should match first
      engine.placeOrder('sellerA', 'sell', 100, 10, 'GTC');
      engine.placeOrder('sellerB', 'sell', 100, 10, 'GTC');

      const result = engine.placeOrder('buyer', 'buy', 101, 15, 'GTC');
      expect(result.trades).toHaveLength(2);

      // sellerA's order should be first (earlier timestamp)
      expect(result.trades[0].sellerId).toBe('sellerA');
      expect(result.trades[0].units).toBe(10);
      expect(result.trades[1].sellerId).toBe('sellerB');
      expect(result.trades[1].units).toBe(5);
    });
  });

  describe('Self-trade prevention (STP)', () => {
    it('user cannot match against own resting order', () => {
      const engine = new MatchingEngine();
      // User A places a sell order
      engine.placeOrder('userA', 'sell', 100, 10, 'GTC');

      // User A places a buy order at same price — should NOT match own sell
      const result = engine.placeOrder('userA', 'buy', 100, 10, 'GTC');
      expect(result.trades).toHaveLength(0);
      expect(result.status).toBe('open'); // rests on book
    });

    it('user can match against different user order', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('userA', 'sell', 100, 10, 'GTC');

      const result = engine.placeOrder('userB', 'buy', 100, 10, 'GTC');
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].buyerId).toBe('userB');
      expect(result.trades[0].sellerId).toBe('userA');
    });

    it('all trades have distinct buyer and seller', () => {
      const engine = new MatchingEngine();
      // Place orders from multiple users
      engine.placeOrder('userA', 'sell', 100, 10, 'GTC');
      engine.placeOrder('userB', 'sell', 101, 10, 'GTC');
      engine.placeOrder('userA', 'buy', 102, 15, 'GTC');
      engine.placeOrder('userC', 'sell', 99, 5, 'GTC');
      engine.placeOrder('userB', 'buy', 103, 20, 'GTC');

      const trades = engine.getTrades();
      for (const trade of trades) {
        expect(trade.buyerId).not.toBe(trade.sellerId);
      }
    });

    it('STP does not block other users from matching', () => {
      const engine = new MatchingEngine();
      // User A has sell at 100
      engine.placeOrder('userA', 'sell', 100, 10, 'GTC');
      // User A tries to buy at 100 — blocked by STP, rests on book
      engine.placeOrder('userA', 'buy', 100, 10, 'GTC');

      // User B buys at 100 — should match user A's sell
      const result = engine.placeOrder('userB', 'buy', 100, 10, 'GTC');
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].sellerId).toBe('userA');
      expect(result.trades[0].buyerId).toBe('userB');
    });
  });

  describe('Balance conservation', () => {
    it('total units traded equals total units filled', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('userA', 'sell', 100, 10, 'GTC');
      engine.placeOrder('userB', 'sell', 101, 5, 'GTC');

      const result = engine.placeOrder('userC', 'buy', 102, 12, 'GTC');
      const totalTradedUnits = result.trades.reduce((sum, t) => sum + t.units, 0);
      expect(totalTradedUnits).toBe(12); // buyer got 12 units
    });

    it('units are conserved across multiple trades', () => {
      const engine = new MatchingEngine();
      // 4 sellers, each offering 10 units
      engine.placeOrder('s1', 'sell', 100, 10, 'GTC');
      engine.placeOrder('s2', 'sell', 100, 10, 'GTC');
      engine.placeOrder('s3', 'sell', 100, 10, 'GTC');
      engine.placeOrder('s4', 'sell', 100, 10, 'GTC');

      // Buyer wants 35 units
      const result = engine.placeOrder('buyer', 'buy', 100, 35, 'GTC');
      const totalTradedUnits = result.trades.reduce((sum, t) => sum + t.units, 0);
      expect(totalTradedUnits).toBe(35);
      expect(result.status).toBe('filled');
    });
  });

  describe('TIF compliance', () => {
    it('GTC order rests unfilled portion on book', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('seller', 'sell', 100, 5, 'GTC');

      // Buy 10 but only 5 available — 5 should rest
      const result = engine.placeOrder('buyer', 'buy', 100, 10, 'GTC');
      expect(result.status).toBe('partially_filled');
      expect(result.trades.reduce((s, t) => s + t.units, 0)).toBe(5);

      // The unfilled 5 should be resting
      const openOrders = engine.getOpenOrders();
      const buyerOrder = openOrders.find(o => o.userId === 'buyer');
      expect(buyerOrder).toBeDefined();
      expect(buyerOrder!.units - buyerOrder!.filledUnits).toBe(5);
    });

    it('IOC order cancels unfilled portion', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('seller', 'sell', 100, 5, 'GTC');

      const result = engine.placeOrder('buyer', 'buy', 100, 10, 'IOC');
      expect(result.status).toBe('cancelled'); // partially filled but cancelled
      expect(result.trades.reduce((s, t) => s + t.units, 0)).toBe(5);

      // Unfilled portion should NOT be on the book
      const openOrders = engine.getOpenOrders();
      const buyerOrder = openOrders.find(o => o.userId === 'buyer');
      expect(buyerOrder).toBeUndefined();
    });

    it('FOK order is all-or-nothing', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('seller', 'sell', 100, 5, 'GTC');

      // FOK for 10 but only 5 available — should cancel entirely
      const result = engine.placeOrder('buyer', 'buy', 100, 10, 'FOK');
      expect(result.status).toBe('cancelled');
      expect(result.trades).toHaveLength(0);
    });

    it('FOK order fills when sufficient depth', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('seller1', 'sell', 100, 5, 'GTC');
      engine.placeOrder('seller2', 'sell', 101, 5, 'GTC');

      // FOK for 8 at 101 — 10 available (5@100 + 5@101), should fill
      const result = engine.placeOrder('buyer', 'buy', 101, 8, 'FOK');
      expect(result.status).toBe('filled');
      expect(result.trades.reduce((s, t) => s + t.units, 0)).toBe(8);
    });
  });

  describe('Deterministic replay', () => {
    it('same command sequence produces same trades', () => {
      const runOnce = () => {
        const engine = new MatchingEngine();
        engine.placeOrder('u1', 'sell', 100, 10, 'GTC');
        engine.placeOrder('u2', 'sell', 101, 5, 'GTC');
        engine.placeOrder('u3', 'buy', 102, 12, 'GTC');
        return engine.getTrades().map(t => ({
          buyerId: t.buyerId,
          sellerId: t.sellerId,
          price: t.price,
          units: t.units,
        }));
      };

      const first = runOnce();
      const second = runOnce();
      expect(second).toEqual(first);
    });
  });

  describe('No negative positions', () => {
    it('cannot fill more than available', () => {
      const engine = new MatchingEngine();
      engine.placeOrder('seller', 'sell', 100, 10, 'GTC');

      // Try to buy 100 — only 10 available
      const result = engine.placeOrder('buyer', 'buy', 100, 100, 'GTC');
      expect(result.trades.reduce((s, t) => s + t.units, 0)).toBe(10);
      expect(result.status).toBe('partially_filled');
    });
  });
});
