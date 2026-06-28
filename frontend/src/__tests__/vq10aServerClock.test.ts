import { describe, it, expect } from 'vitest';
import {
  resolveAuctionTiming,
  formatCountdown,
  type AuctionTimingInput,
} from '../hooks/useServerClock';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

function makeTiming(
  startsAtOffset: number,
  endsAtOffset: number,
  extra?: Partial<AuctionTimingInput>
): AuctionTimingInput {
  const startsAt = new Date(NOW + startsAtOffset).toISOString();
  const endsAt = new Date(NOW + endsAtOffset).toISOString();
  return { startsAt, endsAt, ...extra };
}

describe('useServerClock — resolveAuctionTiming', () => {
  it('resolves upcoming when startsAt is in the future', () => {
    const input = makeTiming(ONE_HOUR, ONE_HOUR + 6 * ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('upcoming');
    expect(result.msToStart).toBe(ONE_HOUR);
    expect(result.msToEnd).toBe(7 * ONE_HOUR);
    expect(result.progress).toBe(0);
  });

  it('resolves live when now is between startsAt and endsAt', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('live');
    expect(result.msToStart).toBe(0);
    expect(result.msToEnd).toBe(ONE_HOUR);
    expect(result.progress).toBeCloseTo(0.5, 2);
  });

  it('resolves ended when endsAt has passed', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('ended');
    expect(result.msToStart).toBe(0);
    expect(result.msToEnd).toBe(0);
    expect(result.progress).toBe(1);
  });

  it('cancelled takes precedence over live/ended', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR, {
      cancelledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('cancelled');
  });

  it('cancelled takes precedence over ended', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR, {
      cancelledAt: new Date(NOW - 2 * ONE_HOUR).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('cancelled');
  });

  it('settled takes precedence over live', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR, {
      settledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('settled');
  });

  it('settled takes precedence over ended', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR, {
      settledAt: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('settled');
  });

  it('cancelled takes precedence over settled', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR, {
      cancelledAt: new Date(NOW - 10 * 60 * 1000).toISOString(),
      settledAt: new Date(NOW - 5 * 60 * 1000).toISOString(),
    });
    const result = resolveAuctionTiming(input, NOW);
    expect(result.effectiveState).toBe('cancelled');
  });

  it('upcoming transitions to live as time passes', () => {
    const input = makeTiming(ONE_HOUR, 7 * ONE_HOUR);
    const before = resolveAuctionTiming(input, NOW);
    expect(before.effectiveState).toBe('upcoming');

    const after = resolveAuctionTiming(input, NOW + 2 * ONE_HOUR);
    expect(after.effectiveState).toBe('live');
  });

  it('live transitions to ended as time passes', () => {
    const input = makeTiming(-ONE_HOUR, ONE_HOUR);
    const before = resolveAuctionTiming(input, NOW);
    expect(before.effectiveState).toBe('live');

    const after = resolveAuctionTiming(input, NOW + 2 * ONE_HOUR);
    expect(after.effectiveState).toBe('ended');
  });

  it('never produces a negative countdown', () => {
    const input = makeTiming(-3 * ONE_HOUR, -ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.msToStart).toBe(0);
    expect(result.msToEnd).toBe(0);
  });

  it('progress uses actual duration, not a hardcoded 6-hour denominator', () => {
    const input = makeTiming(-2 * ONE_HOUR, 2 * ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBeCloseTo(0.5, 2);
  });

  it('progress is 0 at start of a 24-hour auction', () => {
    const input = makeTiming(0, ONE_DAY);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBe(0);
  });

  it('progress is 0.5 at midpoint of a 24-hour auction', () => {
    const input = makeTiming(-12 * ONE_HOUR, 12 * ONE_HOUR);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBeCloseTo(0.5, 2);
  });

  it('progress is 1 at end of a 24-hour auction', () => {
    const input = makeTiming(-ONE_DAY, 0);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBe(1);
  });

  it('progress is clamped to [0, 1]', () => {
    const input = makeTiming(-2 * ONE_DAY, -ONE_DAY);
    const result = resolveAuctionTiming(input, NOW);
    expect(result.progress).toBe(1);
  });
});

describe('useServerClock — formatCountdown', () => {
  it('returns "Ended" for zero or negative', () => {
    expect(formatCountdown(0)).toBe('Ended');
    expect(formatCountdown(-1000)).toBe('Ended');
  });

  it('formats seconds correctly', () => {
    expect(formatCountdown(30_000)).toBe('00:00:30');
  });

  it('formats minutes correctly', () => {
    expect(formatCountdown(5 * 60 * 1000)).toBe('00:05:00');
  });

  it('formats hours correctly', () => {
    expect(formatCountdown(3 * ONE_HOUR + 30 * 60 * 1000)).toBe('03:30:00');
  });

  it('formats days correctly', () => {
    const ms = 2 * ONE_DAY + 3 * ONE_HOUR + 30 * 60 * 1000;
    expect(formatCountdown(ms)).toBe('2d 03h 30m');
  });
});
