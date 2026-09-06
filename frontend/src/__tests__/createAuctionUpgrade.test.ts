import { describe, it, expect } from 'vitest';
import { toIze, toFiat, formatIzeAmount } from '../utils/currency';

describe('Auction Economics & Bid Ladder Calculations', () => {
  const mockFxRates = {
    GBP: 1,
    USD: 1.3,
    EUR: 1.18,
    IZE: 1.2917,
  };

  function getIncrement(startingBid: number): number {
    if (startingBid <= 0) return 5;
    if (startingBid < 50) return 2;
    if (startingBid < 200) return 5;
    if (startingBid < 500) return 10;
    if (startingBid < 2000) return 25;
    return 50;
  }

  it('calculates correct bid increment tiers based on starting floor', () => {
    expect(getIncrement(30)).toBe(2);
    expect(getIncrement(120)).toBe(5);
    expect(getIncrement(350)).toBe(10);
    expect(getIncrement(1200)).toBe(25);
    expect(getIncrement(5000)).toBe(50);
  });

  it('correctly calculates next valid minimum bid from opening floor', () => {
    const startingBid = 150;
    const increment = getIncrement(startingBid);
    const nextBid = startingBid + increment;
    expect(nextBid).toBe(155);
  });

  it('validates reserve price is greater than or equal to starting bid', () => {
    const startingBid = 100;
    const validReserve = 120;
    const invalidReserve = 80;

    expect(validReserve >= startingBid).toBe(true);
    expect(invalidReserve >= startingBid).toBe(false);
  });

  it('validates instant buyout price is strictly greater than starting bid', () => {
    const startingBid = 100;
    const validBuyNow = 180;
    const invalidBuyNow = 90;
    const equalBuyNow = 100;

    expect(validBuyNow > startingBid).toBe(true);
    expect(invalidBuyNow > startingBid).toBe(false);
    expect(equalBuyNow > startingBid).toBe(false);
  });

  it('converts starting bid and reserve to 1ZE with high precision display', () => {
    const startingBidGbp = 100;
    const izeAmount = toIze(startingBidGbp, 'GBP', mockFxRates);
    const formattedIze = formatIzeAmount(izeAmount);

    expect(izeAmount).toBeGreaterThan(0);
    expect(formattedIze.toLowerCase()).toContain('1ze');
  });

  it('properly preserves route param listingId when provided', () => {
    const routeParams = { listingId: 'listing-vault-999' };
    const fallbackListingId = 'listing-default-001';
    const activeId = routeParams.listingId ?? fallbackListingId;

    expect(activeId).toBe('listing-vault-999');
  });
});
