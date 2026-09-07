import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FRONTEND_SERVICES = resolve(__dirname, '../services');
const FRONTEND_CONTRACTS = resolve(__dirname, '../platform/product');
const BACKEND_INDEX = resolve(__dirname, '../../../backend/api/src/index.ts');

function readService(name: string): string {
  return readFileSync(resolve(FRONTEND_SERVICES, name), 'utf-8');
}

function readContract(name: string): string {
  return readFileSync(resolve(FRONTEND_CONTRACTS, name), 'utf-8');
}

function readBackend(file = 'index.ts'): string {
  return readFileSync(resolve(__dirname, '../../../backend/api/src', file), 'utf-8');
}

describe('backend contracts (spec 05_BACKEND)', () => {
  const marketApi = readService('marketApi.ts');
  const listingContract = readContract('listingDetailContract.ts');
  const backend = readBackend();
  const backendCoOwn = readBackend('routes/coOwn.ts');

  // ── Auction media contract ──
  describe('auction media contract', () => {
    it('AuctionMediaItem type exists in frontend marketApi', () => {
      expect(marketApi).toContain('interface AuctionMediaItem');
      expect(marketApi).toContain("type: 'image' | 'video'");
      expect(marketApi).toContain('blurhash');
      expect(marketApi).toContain('focalX');
      expect(marketApi).toContain('focalY');
      expect(marketApi).toContain('posterUrl');
      expect(marketApi).toContain('order: number');
    });

    it('AuctionDetail has mediaItems field', () => {
      expect(marketApi).toContain('mediaItems?: AuctionMediaItem[]');
    });

    it('backend auction detail response includes mediaItems', () => {
      // The backend serialiser should include mediaItems in the response.
      const auctionDetailHandler = backend.match(/app\.get\('\/auctions\/:auctionId'[\s\S]*?^\}\);/m);
      expect(auctionDetailHandler).toBeTruthy();
      expect(auctionDetailHandler![0]).toContain('mediaItems');
    });
  });

  // ── Auction fulfilment contract ──
  describe('auction fulfilment contract', () => {
    it('AuctionFulfilmentSummary type exists in frontend marketApi', () => {
      expect(marketApi).toContain('interface AuctionFulfilmentSummary');
      expect(marketApi).toContain('orderId: string | null');
      expect(marketApi).toContain('paymentStatus');
      expect(marketApi).toContain('fulfilmentStatus');
      expect(marketApi).toContain('buyerNextAction: string | null');
      expect(marketApi).toContain('sellerNextAction: string | null');
    });

    it('AuctionDetail has fulfilment field', () => {
      expect(marketApi).toContain('fulfilment?: AuctionFulfilmentSummary | null');
    });

    it('backend auction detail response includes fulfilment', () => {
      const auctionDetailHandler = backend.match(/app\.get\('\/auctions\/:auctionId'[\s\S]*?^\}\);/m);
      expect(auctionDetailHandler).toBeTruthy();
      expect(auctionDetailHandler![0]).toContain('fulfilment');
    });
  });

  // ── Co-Own market snapshot contract ──
  describe('co-own market snapshot contract', () => {
    it('CoOwnMarketSnapshot type exists in frontend marketApi', () => {
      expect(marketApi).toContain('interface CoOwnMarketSnapshot');
      expect(marketApi).toContain('lastExecutionPriceGbp: number | null');
      expect(marketApi).toContain('lastExecutionAt: string | null');
      expect(marketApi).toContain('volume24hGbp: number | null');
      expect(marketApi).toContain('marketMovePct24h: number | null');
      expect(marketApi).toContain('bestBidGbp: number | null');
      expect(marketApi).toContain('bestAskGbp: number | null');
    });

    it('MarketCoOwnAsset has marketSnapshot field', () => {
      expect(marketApi).toContain('marketSnapshot?: CoOwnMarketSnapshot | null');
    });

    it('backend co-own asset detail response includes marketSnapshot', () => {
      const coOwnHandler = backendCoOwn.match(/app\.get\('\/co-own\/assets\/:assetId'[^/][\s\S]*?^\}\);/m);
      expect(coOwnHandler).toBeTruthy();
      expect(coOwnHandler![0]).toContain('marketSnapshot');
    });
  });

  // ── Co-Own candle contract ──
  describe('co-own candle contract', () => {
    it('CoOwnCandle type exists in frontend marketApi', () => {
      expect(marketApi).toContain('interface CoOwnCandle');
      expect(marketApi).toContain('timestamp: string');
      expect(marketApi).toContain('openGbp: number');
      expect(marketApi).toContain('highGbp: number');
      expect(marketApi).toContain('lowGbp: number');
      expect(marketApi).toContain('closeGbp: number');
      expect(marketApi).toContain('volume: number');
    });

    it('MarketCoOwnAsset has candles field', () => {
      expect(marketApi).toContain('candles?: CoOwnCandle[]');
    });

    it('backend co-own asset detail response includes candles', () => {
      const coOwnHandler = backendCoOwn.match(/app\.get\('\/co-own\/assets\/:assetId'[^/][\s\S]*?^\}\);/m);
      expect(coOwnHandler).toBeTruthy();
      expect(coOwnHandler![0]).toContain('candles');
    });
  });

  // ── Direct listing engagement contract ──
  describe('direct listing engagement contract', () => {
    it('ListingEngagementSummary has questionCount field', () => {
      expect(listingContract).toContain('questionCount?: number');
    });

    it('backend listing detail response includes engagement', () => {
      const listingHandler = backend.match(/app\.get\('\/listings\/:listingId'[^/][\s\S]*?^\}\);/m);
      expect(listingHandler).toBeTruthy();
      expect(listingHandler![0]).toContain('engagement');
      expect(listingHandler![0]).toContain('questionCount');
    });

    it('backend queries listing_qa table for question count', () => {
      const listingHandler = backend.match(/app\.get\('\/listings\/:listingId'[^/][\s\S]*?^\}\);/m);
      expect(listingHandler).toBeTruthy();
      expect(listingHandler![0]).toContain('listing_qa');
    });

    it('backend gracefully handles missing listing_qa table', () => {
      const listingHandler = backend.match(/app\.get\('\/listings\/:listingId'[^/][\s\S]*?^\}\);/m);
      expect(listingHandler).toBeTruthy();
      expect(listingHandler![0]).toContain('catch');
      expect(listingHandler![0]).toContain('table may not exist');
    });
  });

  // ── Co-Own supply buckets nullable contract ──
  describe('co-own supply buckets nullable contract', () => {
    it('CoOwnSupplyBuckets accepts null values', () => {
      const ownershipPanel = readFileSync(
        resolve(__dirname, '../components/coown/CoOwnOwnershipPanel.tsx'),
        'utf-8'
      );
      expect(ownershipPanel).toContain('authorised?: number | null');
      expect(ownershipPanel).toContain('issued?: number | null');
      expect(ownershipPanel).toContain('publicFloat?: number | null');
      expect(ownershipPanel).toContain('treasury?: number | null');
    });
  });
});
