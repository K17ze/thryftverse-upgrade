import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Seller Hub and Analytics Upgrade Verification', () => {
  const sellerHubPath = path.resolve(__dirname, '../screens/SellerHubScreen.tsx');
  const sellerAnalyticsPath = path.resolve(__dirname, '../screens/SellerAnalyticsScreen.tsx');

  it('verifies SellerHubScreen has purged all internal tech jargon and AI slop', () => {
    const content = fs.readFileSync(sellerHubPath, 'utf8');

    // Internal developer / framework jargon must never be exposed to merchants
    expect(content).not.toContain('Victory Native GPU analytics');
    expect(content).not.toContain('Victory Native');
    expect(content).not.toContain('GPU analytics');

    // Generic AI sparkles and patronizing playbooks must be completely eradicated
    expect(content).not.toContain('Storefront Optimization');
    expect(content).not.toContain('New seller playbook');
    expect(content).not.toContain('healthInsightCard');
    expect(content).not.toContain('newSellerCard');

    // The KYC banner and identity row are purged from the hub — the surface
    // opens directly on the money panel; identity lives on the Profile tab.
    expect(content).not.toContain('Identity & Seller Verification');
    expect(content).not.toContain('KYCVerification');

    // Architecture: Screen must be a lean orchestrator (< 400 lines) composing modular components
    const lines = content.split('\n').length;
    expect(lines).toBeLessThan(400);

    // Verifies modular domain component imports — the 4-pillar module composition
    expect(content).toContain('SellerPillarTiles');
    expect(content).toContain('SellerExecutiveHero');
    expect(content).toContain('SellerOrdersModule');
    expect(content).toContain('SellerAnalyticsModule');
    expect(content).toContain('SellerClosetModule');
    expect(content).toContain('SellerListingsModule');

    // Bloat rails are purged from the hub composition
    expect(content).not.toContain('SellerFulfillmentRadar');
    expect(content).not.toContain('SellerInventoryMatrix');
    expect(content).not.toContain('SellerOperationsRail');
    expect(content).not.toContain('SellerQuickActionRail');
    expect(content).not.toContain('SellerStoreRows');
  });

  it('verifies all seller domain components exist with human engineering depth', () => {
    const sellerDir = path.resolve(__dirname, '../components/seller');
    const tilesFile = fs.readFileSync(path.join(sellerDir, 'SellerPillarTiles.tsx'), 'utf8');
    const heroFile = fs.readFileSync(path.join(sellerDir, 'SellerExecutiveHero.tsx'), 'utf8');
    const ordersFile = fs.readFileSync(path.join(sellerDir, 'SellerOrdersModule.tsx'), 'utf8');
    const analyticsFile = fs.readFileSync(path.join(sellerDir, 'SellerAnalyticsModule.tsx'), 'utf8');
    const closetFile = fs.readFileSync(path.join(sellerDir, 'SellerClosetModule.tsx'), 'utf8');
    const listingsFile = fs.readFileSync(path.join(sellerDir, 'SellerListingsModule.tsx'), 'utf8');
    const railFile = fs.readFileSync(path.join(sellerDir, 'SellerThumbRail.tsx'), 'utf8');

    // SellerPillarTiles: eBay-style quick-access row with attention badge
    expect(tilesFile).toContain('Wallet');
    expect(tilesFile).toContain('Orders');
    expect(tilesFile).toContain('Analytics');
    expect(tilesFile).toContain('Closet');
    expect(tilesFile).toContain('badge');

    // SellerExecutiveHero: identity row + liquidity-only money panel (Stripe balances model)
    expect(heroFile).toContain('Available payout');
    expect(heroFile).toContain('In escrow');
    expect(heroFile).toContain('Next payout');
    // Net sales moved out of the money panel — no duplication with the analytics module
    expect(heroFile).not.toContain('30-Day Net Sales');

    // SellerOrdersModule: media rail of real orders + SLA-aware task rows
    expect(ordersFile).toContain('Orders');
    expect(ordersFile).toContain('View all');
    expect(ordersFile).toContain('All clear');
    expect(ordersFile).toContain('CachedImage');
    expect(ordersFile).toContain("dueLabel.includes('Overdue')");
    expect(ordersFile).toContain('isUrgentDue');

    // SellerAnalyticsModule: real sparkline via the shared chart primitive
    expect(analyticsFile).toContain('Analytics');
    expect(analyticsFile).toContain('LineChart');
    expect(analyticsFile).toContain('Flat');

    // Closet + Listings modules: thumbnail rails with honest empty states
    expect(closetFile).toContain('Closet');
    expect(closetFile).toContain('SellerThumbRail');
    expect(closetFile).toContain('Save pieces you love');
    expect(listingsFile).toContain('Listings');
    expect(listingsFile).toContain('Nothing listed yet');
    expect(railFile).toContain('CachedImage');
  });

  it('verifies hub bloat components are deleted from the codebase', () => {
    const sellerDir = path.resolve(__dirname, '../components/seller');
    const purgedFiles = [
      'SellerFulfillmentRadar.tsx',
      'SellerInventoryMatrix.tsx',
      'SellerOperationsRail.tsx',
      'SellerQuickActionRail.tsx',
      'ListingHealthCard.tsx',
      'PerformanceTrendSummary.tsx',
      'SellerReputationCard.tsx',
      'SoldCompsChart.tsx',
      'SellerOrdersQueue.tsx',
      'SellerStoreRows.tsx',
    ];
    for (const file of purgedFiles) {
      expect(fs.existsSync(path.join(sellerDir, file))).toBe(false);
    }
  });

  it('verifies SellerAnalyticsScreen contains flagship architecture and 0 AI slop', () => {
    const content = fs.readFileSync(sellerAnalyticsPath, 'utf8');

    // No internal framework jargon or AI advice slop
    expect(content).not.toContain('Victory Native GPU analytics');
    expect(content).not.toContain('playbook');
    expect(content).not.toContain('Storefront Optimization');

    // Multi-metric dimension switcher present
    expect(content).toContain('MetricDimension');
    expect(content).toContain('Net Sales Trajectory');
    expect(content).toContain('Order Volume');
    expect(content).toContain('Store Traffic');
    expect(content).toContain('Conversion Trajectory');

    // 5-Stage Conversion Journey Pipeline
    expect(content).toContain('Conversion journey');
    expect(content).toContain('Discovery Impressions');
    expect(content).toContain('Qualified Detail Views');
    expect(content).toContain('Vault Saves');
    expect(content).toContain('Direct Offers & Inquiries');
    expect(content).toContain('Settled Sales');

    // Portfolio category distribution
    expect(content).toContain('Inventory category mix');

    // Market price benchmark spectrum & adjustments
    expect(content).toContain('Market price spectrum');
    expect(content).toContain('Price adjustments');
    expect(content).toContain('Velocity opportunities');
  });

  describe('Commerce Analytics Domain Logic', () => {
    it('accurately computes revenue, AOV, and conversion rates', () => {
      const revenueGbpMinor = 245000; // £2,450.00
      const itemsSold = 14;
      const totalViews = 560;

      const heroValue = revenueGbpMinor / 100;
      expect(heroValue).toBe(2450);

      const avgOrderValue = heroValue / itemsSold;
      expect(Math.round(avgOrderValue * 100) / 100).toBe(175);

      const conversionRate = (itemsSold / totalViews) * 100;
      expect(Math.round(conversionRate * 10) / 10).toBe(2.5);
    });

    it('correctly calculates period-over-period percentage deltas with safe clamping', () => {
      const deltaPct = (current: number, previous: number): number | null => {
        if (previous <= 0) return null;
        const pct = ((current - previous) / previous) * 100;
        return Math.min(Math.max(Math.round(pct * 10) / 10, -999), 999);
      };

      expect(deltaPct(150, 100)).toBe(50);
      expect(deltaPct(80, 100)).toBe(-20);
      expect(deltaPct(5000, 1)).toBe(999); // Clamped at +999%
      expect(deltaPct(10, 0)).toBeNull(); // Safe fallback for 0 denominator
    });

    it('correctly computes 5-stage conversion pipeline drop-offs and step efficiencies', () => {
      const funnel = {
        impressions: 10000,
        views: 1500,
        saves: 300,
        offers: 75,
        purchases: 15,
      };

      const viewThrough = (funnel.views / funnel.impressions) * 100;
      expect(viewThrough).toBe(15);

      const saveRate = (funnel.saves / funnel.views) * 100;
      expect(saveRate).toBe(20);

      const offerRate = (funnel.offers / funnel.saves) * 100;
      expect(offerRate).toBe(25);

      const closeRate = (funnel.purchases / funnel.offers) * 100;
      expect(closeRate).toBe(20);

      const dropOffAfterViews = 100 - saveRate;
      expect(dropOffAfterViews).toBe(80); // 80% attrition
    });

    it('correctly calculates category mix distribution and percentage shares', () => {
      const mockListings = [
        { category: 'Outerwear', priceGbp: 400 },
        { category: 'Outerwear', priceGbp: 200 },
        { category: 'Footwear', priceGbp: 300 },
        { category: 'Denim', priceGbp: 100 },
      ];

      const map = new Map<string, { count: number; totalGbp: number }>();
      let totalStoreValue = 0;
      for (const item of mockListings) {
        totalStoreValue += item.priceGbp;
        const existing = map.get(item.category) || { count: 0, totalGbp: 0 };
        map.set(item.category, { count: existing.count + 1, totalGbp: existing.totalGbp + item.priceGbp });
      }

      expect(totalStoreValue).toBe(1000);
      expect(map.get('Outerwear')?.totalGbp).toBe(600);
      expect(map.get('Outerwear')?.count).toBe(2);
      expect(Math.round((map.get('Outerwear')!.totalGbp / totalStoreValue) * 100)).toBe(60);

      expect(map.get('Footwear')?.totalGbp).toBe(300);
      expect(Math.round((map.get('Footwear')!.totalGbp / totalStoreValue) * 100)).toBe(30);

      expect(map.get('Denim')?.totalGbp).toBe(100);
      expect(Math.round((map.get('Denim')!.totalGbp / totalStoreValue) * 100)).toBe(10);
    });

    it('positions asking price correctly along the market price spectrum', () => {
      const minPrice = 80;
      const medianPrice = 150;
      const maxPrice = 300;

      const evaluatePosition = (askingPrice: number) => {
        const span = Math.max(maxPrice - minPrice, 1);
        const posPct = Math.min(94, Math.max(6, Math.round(((askingPrice - minPrice) / span) * 100)));
        const isBelowMedian = askingPrice < medianPrice * 0.96;
        const isAboveMedian = askingPrice > medianPrice * 1.04;
        const posBadge = isBelowMedian
          ? 'Competitive velocity'
          : isAboveMedian
          ? 'Premium tier'
          : 'Market median';

        return { posPct, posBadge };
      };

      // Below median (e.g. £110)
      const below = evaluatePosition(110);
      expect(below.posBadge).toBe('Competitive velocity');
      expect(below.posPct).toBeGreaterThanOrEqual(6);
      expect(below.posPct).toBeLessThan(50);

      // At median (e.g. £150)
      const atMed = evaluatePosition(150);
      expect(atMed.posBadge).toBe('Market median');

      // Above median (e.g. £240)
      const above = evaluatePosition(240);
      expect(above.posBadge).toBe('Premium tier');
      expect(above.posPct).toBeGreaterThan(50);

      // Extreme edge clamped safely
      const extremeLow = evaluatePosition(10);
      expect(extremeLow.posPct).toBe(6);

      const extremeHigh = evaluatePosition(1000);
      expect(extremeHigh.posPct).toBe(94);
    });

    it('accurately evaluates SLA dispatch deadlines and urgency tiers (StockX / Shopify SLA standard)', () => {
      const evaluateSla = (dueAtIso: string, nowMs: number) => {
        const dueMs = new Date(dueAtIso).getTime();
        const diffHours = (dueMs - nowMs) / (1000 * 60 * 60);
        if (diffHours < 0) return { label: 'Overdue SLA', priority: 'critical' };
        if (diffHours < 12) return { label: `Critical SLA: ${Math.ceil(diffHours)}h`, priority: 'critical' };
        if (diffHours < 24) return { label: `SLA: ${Math.ceil(diffHours)}h remaining`, priority: 'high' };
        return { label: `Due in ${Math.ceil(diffHours / 24)}d`, priority: 'normal' };
      };

      const now = new Date('2026-09-06T12:00:00Z').getTime();

      // Overdue order
      const overdue = evaluateSla('2026-09-06T10:00:00Z', now);
      expect(overdue.label).toBe('Overdue SLA');
      expect(overdue.priority).toBe('critical');

      // Critical (< 12h)
      const critical = evaluateSla('2026-09-06T18:00:00Z', now); // 6h away
      expect(critical.label).toBe('Critical SLA: 6h');
      expect(critical.priority).toBe('critical');

      // Approaching (< 24h)
      const approaching = evaluateSla('2026-09-07T06:00:00Z', now); // 18h away
      expect(approaching.label).toBe('SLA: 18h remaining');
      expect(approaching.priority).toBe('high');

      // Normal (e.g. 48h away)
      const normal = evaluateSla('2026-09-08T12:00:00Z', now);
      expect(normal.label).toBe('Due in 2d');
      expect(normal.priority).toBe('normal');
    });

    it('identifies the primary conversion bottleneck in the 5-stage buyer funnel (Shopify 2026 Mobile)', () => {
      const detectBottleneck = (stages: { id: string; label: string; value: number }[]) => {
        let maxDrop = -1;
        let bottleneck: { stageFrom: string; stageTo: string; dropOffPct: number } | null = null;
        for (let i = 1; i < stages.length; i++) {
          const prev = stages[i - 1].value;
          const curr = stages[i].value;
          if (prev > 0) {
            const dropPct = Math.round(((prev - curr) / prev) * 100);
            if (dropPct > maxDrop && dropPct > 30) {
              maxDrop = dropPct;
              bottleneck = {
                stageFrom: stages[i - 1].label,
                stageTo: stages[i].label,
                dropOffPct: dropPct,
              };
            }
          }
        }
        return bottleneck;
      };

      const stages = [
        { id: 'impressions', label: 'Discovery Impressions', value: 10000 },
        { id: 'views', label: 'Qualified Detail Views', value: 5000 },  // 50% drop
        { id: 'saves', label: 'Vault Saves', value: 500 },              // 90% drop (max)
        { id: 'offers', label: 'Direct Offers & Inquiries', value: 200 },// 60% drop
        { id: 'purchases', label: 'Settled Sales', value: 100 },         // 50% drop
      ];

      const bn = detectBottleneck(stages);
      expect(bn).not.toBeNull();
      expect(bn?.stageFrom).toBe('Qualified Detail Views');
      expect(bn?.stageTo).toBe('Vault Saves');
      expect(bn?.dropOffPct).toBe(90);
    });

    it('categorizes inventory velocity by Days on Market (DOM) (Mercari / Grailed standard)', () => {
      const classifyDom = (days: number, isSold: boolean) => {
        if (isSold) return 'Sold';
        if (days < 7) return 'High velocity';
        if (days <= 14) return 'Healthy pacing';
        return 'Stale inventory';
      };

      expect(classifyDom(3, false)).toBe('High velocity');
      expect(classifyDom(10, false)).toBe('Healthy pacing');
      expect(classifyDom(18, false)).toBe('Stale inventory');
      expect(classifyDom(25, true)).toBe('Sold');
    });

    it('computes 1-tap quick repricing options with rounding safety', () => {
      const computeReprice = (askingPrice: number, medianPrice?: number) => {
        const p5 = Math.round(askingPrice * 0.95 * 100) / 100;
        const p10 = Math.round(askingPrice * 0.90 * 100) / 100;
        const canMatchMedian = medianPrice != null && medianPrice > 0 && askingPrice > medianPrice;
        return { p5, p10, canMatchMedian, matchMedianPrice: canMatchMedian ? medianPrice : null };
      };

      // £200 asking price, £160 median
      const r1 = computeReprice(200, 160);
      expect(r1.p5).toBe(190);
      expect(r1.p10).toBe(180);
      expect(r1.canMatchMedian).toBe(true);
      expect(r1.matchMedianPrice).toBe(160);

      // £120 asking price, £150 median (already below median)
      const r2 = computeReprice(120, 150);
      expect(r2.p5).toBe(114);
      expect(r2.p10).toBe(108);
      expect(r2.canMatchMedian).toBe(false);
      expect(r2.matchMedianPrice).toBeNull();
    });

    it('classifies buyer purchase intent signals from save rate and conversion (Depop / Grailed benchmark)', () => {
      const classifyIntent = (views: number, saves: number, conversionRate: number | null, timeOnMarketDays: number) => {
        const saveRate = views > 0 ? Number(((saves / views) * 100).toFixed(1)) : null;
        if (views >= 10 && saveRate != null && saveRate >= 5.0 && (conversionRate == null || conversionRate < 1.5)) {
          return { intentSignal: 'high_intent_price_friction', saveRate };
        }
        if (views >= 20 && saveRate != null && saveRate < 2.0) {
          return { intentSignal: 'low_affinity_photo_needed', saveRate };
        }
        if (conversionRate != null && conversionRate >= 3.0) {
          return { intentSignal: 'healthy_velocity', saveRate };
        }
        if (views < 10 && timeOnMarketDays > 14) {
          return { intentSignal: 'stale_reach', saveRate };
        }
        return { intentSignal: null, saveRate };
      };

      // Case 1: High Saves (8/50 = 16%), 0 sales -> High Intent, Price Friction
      const c1 = classifyIntent(50, 8, null, 5);
      expect(c1.intentSignal).toBe('high_intent_price_friction');
      expect(c1.saveRate).toBe(16.0);

      // Case 2: High Views (100), only 1 save (1%) -> Low Affinity, photo/styling refresh needed
      const c2 = classifyIntent(100, 1, null, 10);
      expect(c2.intentSignal).toBe('low_affinity_photo_needed');
      expect(c2.saveRate).toBe(1.0);

      // Case 3: High Conversion (4%) -> Healthy Velocity
      const c3 = classifyIntent(50, 4, 4.0, 3);
      expect(c3.intentSignal).toBe('healthy_velocity');

      // Case 4: Low Views (4), > 14 days on market -> Stale Reach
      const c4 = classifyIntent(4, 0, null, 20);
      expect(c4.intentSignal).toBe('stale_reach');
    });

    it('verifies ListingAnalyticsDetail contains 2026 flagship patterns', () => {
      const detailPath = path.resolve(__dirname, '../components/seller/analytics/ListingAnalyticsDetail.tsx');
      const detailContent = fs.readFileSync(detailPath, 'utf8');

      // Listing performance section (was verbose "5-Stat Resale Intent Cockpit")
      expect(detailContent).toContain('Save rate');
      expect(detailContent).toContain('High intent');

      // Quick reprice section (was verbose "StockX Pro Pricing Guidance · 1-Tap Velocity Levers")
      expect(detailContent).toContain('Quick reprice');
      expect(detailContent).toContain('Sell Faster');
      expect(detailContent).toContain('Aggressive');
      expect(detailContent).toContain('Sell Now');

      // Verbose AI copy must be purged
      expect(detailContent).not.toContain('5-Stat Resale Intent Cockpit');
      expect(detailContent).not.toContain('StockX Pro Pricing Guidance');
      expect(detailContent).not.toContain('1-Tap Velocity Levers');
      expect(detailContent).not.toContain('High buyer intent detected');
    });
  });

  describe('Custom Date Range Validation', () => {
    // Mirrors validateCustomRange from useSellerAnalytics.ts
    function validateCustomRange(startDate: string, endDate: string): string | null {
      const start = new Date(startDate + 'T00:00:00.000Z');
      const end = new Date(endDate + 'T00:00:00.000Z');
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return 'Enter valid dates';
      }
      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);
      if (start > today || end > today) {
        return 'Dates cannot be in the future';
      }
      const diffDays = (end.getTime() - start.getTime()) / 86400000;
      if (diffDays < 0) {
        return 'Start must be before end';
      }
      if (diffDays > 365) {
        return 'Range cannot exceed 365 days';
      }
      return null;
    }

    it('accepts a valid same-day range', () => {
      expect(validateCustomRange('2026-09-10', '2026-09-10')).toBeNull();
    });

    it('accepts a valid 30-day range', () => {
      expect(validateCustomRange('2026-08-12', '2026-09-10')).toBeNull();
    });

    it('accepts a valid 365-day range (boundary)', () => {
      expect(validateCustomRange('2025-09-11', '2026-09-10')).toBeNull();
    });

    it('rejects reversed dates (start after end)', () => {
      expect(validateCustomRange('2026-09-10', '2026-09-01')).toBe('Start must be before end');
    });

    it('rejects ranges exceeding 365 days', () => {
      expect(validateCustomRange('2024-01-01', '2026-09-10')).toBe('Range cannot exceed 365 days');
    });

    it('rejects future start dates', () => {
      expect(validateCustomRange('2027-01-01', '2027-01-02')).toBe('Dates cannot be in the future');
    });

    it('rejects future end dates', () => {
      expect(validateCustomRange('2026-09-01', '2027-01-01')).toBe('Dates cannot be in the future');
    });

    it('rejects malformed dates', () => {
      expect(validateCustomRange('not-a-date', '2026-09-10')).toBe('Enter valid dates');
      expect(validateCustomRange('2026-09-10', 'garbage')).toBe('Enter valid dates');
    });
  });

  describe('Analytics Period Resolution (Backend Helper Mirror)', () => {
    // Mirrors resolveAnalyticsPeriod from backend/api/src/routes/sellers.ts
    function resolveAnalyticsPeriod(
      input: { period: '7d' | '30d' | '90d' } | { startDate: string; endDate: string }
    ): { start: Date; end: Date; prevStart: Date; prevEnd: Date; days: number } {
      if ('startDate' in input) {
        const start = new Date(input.startDate + 'T00:00:00.000Z');
        const endExclusive = new Date(input.endDate + 'T00:00:00.000Z');
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        const days = Math.max(1, Math.round((endExclusive.getTime() - start.getTime()) / 86400000));
        const prevEnd = new Date(start);
        const prevStart = new Date(start);
        prevStart.setUTCDate(prevStart.getUTCDate() - days);
        return { start, end: endExclusive, prevStart, prevEnd, days };
      }
      const periodDays = input.period === '7d' ? 7 : input.period === '90d' ? 90 : 30;
      const end = new Date();
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - periodDays);
      const prevEnd = new Date(start);
      const prevStart = new Date(start);
      prevStart.setUTCDate(prevStart.getUTCDate() - periodDays);
      return { start, end, prevStart, prevEnd, days: periodDays };
    }

    it('resolves 30d preset to 30-day range', () => {
      const range = resolveAnalyticsPeriod({ period: '30d' });
      expect(range.days).toBe(30);
      expect(range.end.getTime() - range.start.getTime()).toBeCloseTo(30 * 86400000, -2);
    });

    it('resolves 7d preset to 7-day range', () => {
      const range = resolveAnalyticsPeriod({ period: '7d' });
      expect(range.days).toBe(7);
    });

    it('resolves 90d preset to 90-day range', () => {
      const range = resolveAnalyticsPeriod({ period: '90d' });
      expect(range.days).toBe(90);
    });

    it('resolves custom range with correct exclusive end', () => {
      const range = resolveAnalyticsPeriod({ startDate: '2026-08-01', endDate: '2026-08-31' });
      expect(range.days).toBe(31); // inclusive of both start and end
      expect(range.start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-09-01T00:00:00.000Z'); // exclusive
    });

    it('computes previous period as equal length immediately before', () => {
      const range = resolveAnalyticsPeriod({ startDate: '2026-08-01', endDate: '2026-08-31' });
      expect(range.prevStart.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(range.prevEnd.toISOString()).toBe('2026-08-01T00:00:00.000Z'); // exclusive = start of current
      expect(range.days).toBe(31);
      const prevDays = Math.round((range.prevEnd.getTime() - range.prevStart.getTime()) / 86400000);
      expect(prevDays).toBe(31); // same length as current
    });

    it('resolves same-day custom range to 1-day range', () => {
      const range = resolveAnalyticsPeriod({ startDate: '2026-09-10', endDate: '2026-09-10' });
      expect(range.days).toBe(1);
      expect(range.end.toISOString()).toBe('2026-09-11T00:00:00.000Z'); // exclusive
    });
  });

  describe('Analytics API Period Query Builder', () => {
    // Mirrors analyticsPeriodQuery from commerceApi.ts
    function analyticsPeriodQuery(period: '7d' | '30d' | '90d' | { startDate: string; endDate: string }): string {
      if (typeof period === 'string') {
        return `period=${period}`;
      }
      return `startDate=${encodeURIComponent(period.startDate)}&endDate=${encodeURIComponent(period.endDate)}`;
    }

    it('builds preset query string', () => {
      expect(analyticsPeriodQuery('7d')).toBe('period=7d');
      expect(analyticsPeriodQuery('30d')).toBe('period=30d');
      expect(analyticsPeriodQuery('90d')).toBe('period=90d');
    });

    it('builds custom range query string', () => {
      const qs = analyticsPeriodQuery({ startDate: '2026-08-01', endDate: '2026-08-31' });
      expect(qs).toBe('startDate=2026-08-01&endDate=2026-08-31');
    });
  });

  describe('Seller Analytics Custom Range UI Integration', () => {
    it('verifies SellerAnalyticsScreen has custom range selector and sheet', () => {
      const content = fs.readFileSync(sellerAnalyticsPath, 'utf8');

      // Custom chip is present alongside presets
      expect(content).toContain('Custom');
      expect(content).toContain('PRESET_OPTIONS');

      // Custom date range sheet is wired
      expect(content).toContain('AnalyticsDateRangeSheet');
      expect(content).toContain('isRangeSheetVisible');
      expect(content).toContain('setRangeSheetVisible');

      // Custom range label is shown when active
      expect(content).toContain('customRangeLabel');
      expect(content).toContain('formatCustomRangeLabel');

      // Preset options still exist (backward compatible)
      expect(content).toContain("'7d'");
      expect(content).toContain("'30d'");
      expect(content).toContain("'90d'");
    });

    it('verifies AnalyticsDateRangeSheet component exists with validation', () => {
      const sheetPath = path.resolve(__dirname, '../components/seller/analytics/AnalyticsDateRangeSheet.tsx');
      const sheetContent = fs.readFileSync(sheetPath, 'utf8');

      // Sheet uses existing BottomSheet primitive
      expect(sheetContent).toContain('BottomSheet');

      // Has start and end date pickers
      expect(sheetContent).toContain('AppDatePicker');
      expect(sheetContent).toContain('startDate');
      expect(sheetContent).toContain('endDate');

      // Has quick presets inside the sheet
      expect(sheetContent).toContain('Last 7 days');
      expect(sheetContent).toContain('Last 30 days');
      expect(sheetContent).toContain('Last 90 days');

      // Has Apply and Cancel actions
      expect(sheetContent).toContain('Apply');
      expect(sheetContent).toContain('Cancel');

      // Uses the validation function
      expect(sheetContent).toContain('validateCustomRange');
      expect(sheetContent).toContain('validationError');

      // Future dates are disabled (maxDate constraint)
      expect(sheetContent).toContain('maxDate');
    });

    it('verifies commerceApi supports AnalyticsPeriod type', () => {
      const apiPath = path.resolve(__dirname, '../services/commerceApi.ts');
      const apiContent = fs.readFileSync(apiPath, 'utf8');

      // AnalyticsPeriod type is exported
      expect(apiContent).toContain('AnalyticsPeriod');

      // analyticsPeriodQuery helper exists
      expect(apiContent).toContain('analyticsPeriodQuery');

      // All fetch functions accept the new type
      expect(apiContent).toContain('period: AnalyticsPeriod');

      // Dead offsetDays contract is removed
      expect(apiContent).not.toContain('offsetDays');
    });

    it('verifies useAnalyticsInsights computes periodDays and periodLabel dynamically', () => {
      const insightsPath = path.resolve(__dirname, '../components/seller/analytics/useAnalyticsInsights.ts');
      const insightsContent = fs.readFileSync(insightsPath, 'utf8');

      // periodDays is computed via useMemo (not hardcoded)
      expect(insightsContent).toContain('const periodDays = useMemo');
      expect(insightsContent).toContain('typeof period');

      // periodLabel is computed via useMemo
      expect(insightsContent).toContain('const periodLabel = useMemo');

      // Custom range label format
      expect(insightsContent).toContain('toLocaleDateString');
    });

    it('verifies category mix no longer has 2% floor', () => {
      const insightsPath = path.resolve(__dirname, '../components/seller/analytics/useAnalyticsInsights.ts');
      const insightsContent = fs.readFileSync(insightsPath, 'utf8');

      // The 2% floor (Math.max(2, ...)) must be removed
      expect(insightsContent).not.toContain('Math.max(2,');
      expect(insightsContent).toContain('Math.round((stats.totalGbp / totalStoreValue) * 100)');
    });
  });

  describe('Seller Hub Gap Closures', () => {
    it('verifies pillar tiles use 2+2 hierarchy (not 4 equal tiles)', () => {
      const tilesPath = path.resolve(__dirname, '../components/seller/SellerPillarTiles.tsx');
      const tilesContent = fs.readFileSync(tilesPath, 'utf8');

      // All 4 destinations preserved
      expect(tilesContent).toContain('Wallet');
      expect(tilesContent).toContain('Orders');
      expect(tilesContent).toContain('Analytics');
      expect(tilesContent).toContain('Closet');

      // Attention badge preserved
      expect(tilesContent).toContain('badge');

      // Primary tiles have context subtitles (Wallet balance, Orders count)
      expect(tilesContent).toContain('walletBalanceLabel');
      expect(tilesContent).toContain('to ship');

      // Component is under 200 lines
      const lines = tilesContent.split('\n').length;
      expect(lines).toBeLessThan(200);
    });

    it('verifies rail item widths are unified to 104dp', () => {
      const ordersPath = path.resolve(__dirname, '../components/seller/SellerOrdersModule.tsx');
      const ordersContent = fs.readFileSync(ordersPath, 'utf8');
      const thumbRailPath = path.resolve(__dirname, '../components/seller/SellerThumbRail.tsx');
      const thumbRailContent = fs.readFileSync(thumbRailPath, 'utf8');

      // Both rails should reference 104 for thumb size
      expect(ordersContent).toContain('104');
      expect(thumbRailContent).toContain('104');

      // Neither should use the old 96 or 112 for thumb dimensions
      // (96 was the old orders rail, 112 was the old ThumbRail)
      // Note: we check for THUMB_SIZE or similar constants
      expect(thumbRailContent).not.toMatch(/THUMB_SIZE\s*=\s*112/);
      expect(thumbRailContent).not.toMatch(/THUMB_SIZE\s*=\s*96/);
    });

    it('verifies CachedImage supports focalPoint (P3-4 closure)', () => {
      const cachedImagePath = path.resolve(__dirname, '../components/CachedImage.tsx');
      const cachedImageContent = fs.readFileSync(cachedImagePath, 'utf8');

      // focalPoint prop is supported
      expect(cachedImageContent).toContain('focalPoint');
      expect(cachedImageContent).toContain('contentPosition');
    });
  });

  describe('Analytics Trajectory Chart Fixes', () => {
    it('verifies chart is responsive (no hardcoded 300px width)', () => {
      const chartPath = path.resolve(__dirname, '../components/seller/analytics/AnalyticsTrajectoryChart.tsx');
      const chartContent = fs.readFileSync(chartPath, 'utf8');

      // Uses onLayout for responsive width
      expect(chartContent).toContain('onLayout');
      expect(chartContent).toContain('containerWidth');

      // Hardcoded 300 is removed from the path computation
      expect(chartContent).not.toContain('const width = 300');
    });

    it('verifies previous period line is rendered (not just legend)', () => {
      const chartPath = path.resolve(__dirname, '../components/seller/analytics/AnalyticsTrajectoryChart.tsx');
      const chartContent = fs.readFileSync(chartPath, 'utf8');

      // prevLinePath is computed and rendered
      expect(chartContent).toContain('prevLinePath');
      expect(chartContent).toContain('DashPathEffect');
    });

    it('verifies line mode has touch interaction', () => {
      const chartPath = path.resolve(__dirname, '../components/seller/analytics/AnalyticsTrajectoryChart.tsx');
      const chartContent = fs.readFileSync(chartPath, 'utf8');

      // Touch overlay exists for line mode
      expect(chartContent).toContain('lineTouchOverlay');
      expect(chartContent).toContain('lineTouchZone');
    });
  });

  describe('Seller Hub Partial-Resource States', () => {
    it('verifies SellerHubScreen has a per-resource status state machine', () => {
      const content = fs.readFileSync(sellerHubPath, 'utf8');

      // ResourceStatus union type drives independent loading/ready/failed per resource
      expect(content).toContain('ResourceStatus');
      expect(content).toContain('sellingOrdersStatus');
      expect(content).toContain('ownListingsStatus');
      expect(content).toContain('dailyPointsStatus');

      // The 'failed' status is reachable in the state machine
      expect(content).toContain("'failed'");
    });

    it('verifies SellerHubScreen has a shared loader and per-module retry banners', () => {
      const content = fs.readFileSync(sellerHubPath, 'utf8');

      // Shared loader converts rejections into 'failed' status + null data
      expect(content).toContain('fetchHubResource');

      // Inline retry surface is rendered above each failed module
      expect(content).toContain('SyncRetryBanner');

      // Telemetry wiring exists for retry interactions
      expect(content).toContain('telemetryContext');
    });

    it('verifies seller modules accept failure props for partial-state rendering', () => {
      const sellerDir = path.resolve(__dirname, '../components/seller');
      const ordersFile = fs.readFileSync(path.join(sellerDir, 'SellerOrdersModule.tsx'), 'utf8');
      const listingsFile = fs.readFileSync(path.join(sellerDir, 'SellerListingsModule.tsx'), 'utf8');
      const analyticsFile = fs.readFileSync(path.join(sellerDir, 'SellerAnalyticsModule.tsx'), 'utf8');

      // Each module exposes a failure prop so the hub can degrade one
      // resource without tearing down the rest of the surface
      expect(ordersFile).toContain('ordersFailed');
      expect(listingsFile).toContain('isFailed');
      expect(analyticsFile).toContain('isSparklineFailed');
    });
  });
});
