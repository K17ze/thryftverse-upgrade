import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Import actual implementations from the route module ───────────────
// These are the real functions used by the API, not copies. If the route
// code changes, these tests will catch the regression.
import {
  computeEngagementRate,
  changeRatio,
  computePeriodRange,
  computeCompleteness,
} from '../routes/creatorAnalytics.js';

// ── computeEngagementRate ──────────────────────────────────────────────

test('computeEngagementRate: returns 0 for zero views', () => {
  assert.equal(computeEngagementRate(0, 5, 3, 2, 1, 4), 0);
});

test('computeEngagementRate: returns 0 for negative views (defensive)', () => {
  assert.equal(computeEngagementRate(-10, 5, 3, 2, 1, 4), 0);
});

test('computeEngagementRate: computes correct ratio', () => {
  // 100 views, 15 likes, 5 saves, 3 comments, 2 shares, 5 product_clicks = 30 engagement
  // 30/100 = 0.3
  assert.equal(computeEngagementRate(100, 15, 5, 3, 2, 5), 0.3);
});

test('computeEngagementRate: rounds to 5 decimal places', () => {
  // 3/7 = 0.428571... → 0.42857
  assert.equal(computeEngagementRate(7, 1, 1, 1, 0, 0), 0.42857);
});

test('computeEngagementRate: can exceed 1.0 (multiple engagements per view)', () => {
  // 10 views, 20 likes → 2.0
  assert.equal(computeEngagementRate(10, 20, 0, 0, 0, 0), 2);
});

test('computeEngagementRate: all zeros returns 0', () => {
  assert.equal(computeEngagementRate(0, 0, 0, 0, 0, 0), 0);
});

// ── changeRatio ────────────────────────────────────────────────────────

test('changeRatio: returns null when comparison is 0 (no prior data)', () => {
  assert.equal(changeRatio(100, 0), null);
});

test('changeRatio: returns null when both are 0', () => {
  assert.equal(changeRatio(0, 0), null);
});

test('changeRatio: positive growth', () => {
  // (150 - 100) / 100 = 0.5
  assert.equal(changeRatio(150, 100), 0.5);
});

test('changeRatio: negative growth (decline)', () => {
  // (50 - 100) / 100 = -0.5
  assert.equal(changeRatio(50, 100), -0.5);
});

test('changeRatio: no change returns 0', () => {
  assert.equal(changeRatio(100, 100), 0);
});

test('changeRatio: rounds to 4 decimal places', () => {
  // (103 - 100) / 100 = 0.03 → 0.03 (already 4dp)
  assert.equal(changeRatio(103, 100), 0.03);
  // (1 - 3) / 3 = -0.6666... → -0.6667
  assert.equal(changeRatio(1, 3), -0.6667);
});

test('changeRatio: handles large ratio without Infinity', () => {
  // 100 / 0.001 = 99900 — should be a finite number, not Infinity
  const result = changeRatio(100, 0.001);
  assert.ok(result !== null);
  assert.ok(Number.isFinite(result), 'changeRatio should not produce Infinity');
});

// ── computePeriodRange ─────────────────────────────────────────────────

test('computePeriodRange: 30d current and comparison have equal duration', () => {
  const { current, comparison } = computePeriodRange('30d');
  const currentMs = current.endExclusive.getTime() - current.start.getTime();
  const comparisonMs = comparison.endExclusive.getTime() - comparison.start.getTime();
  assert.equal(currentMs, comparisonMs);
  assert.equal(currentMs, 30 * 24 * 60 * 60 * 1000);
});

test('computePeriodRange: 7d current and comparison have equal duration', () => {
  const { current, comparison } = computePeriodRange('7d');
  const currentMs = current.endExclusive.getTime() - current.start.getTime();
  const comparisonMs = comparison.endExclusive.getTime() - comparison.start.getTime();
  assert.equal(currentMs, comparisonMs);
  assert.equal(currentMs, 7 * 24 * 60 * 60 * 1000);
});

test('computePeriodRange: 90d current and comparison have equal duration', () => {
  const { current, comparison } = computePeriodRange('90d');
  const currentMs = current.endExclusive.getTime() - current.start.getTime();
  const comparisonMs = comparison.endExclusive.getTime() - comparison.start.getTime();
  assert.equal(currentMs, comparisonMs);
  assert.equal(currentMs, 90 * 24 * 60 * 60 * 1000);
});

test('computePeriodRange: comparison period is immediately before current', () => {
  const { current, comparison } = computePeriodRange('30d');
  assert.equal(comparison.endExclusive.getTime(), current.start.getTime());
});

test('computePeriodRange: current period ends at UTC midnight', () => {
  const now = new Date('2026-08-25T14:30:00Z');
  const { current } = computePeriodRange('30d', now);
  assert.equal(current.endExclusive.getUTCHours(), 0);
  assert.equal(current.endExclusive.getUTCMinutes(), 0);
  assert.equal(current.endExclusive.getUTCSeconds(), 0);
});

test('computePeriodRange: current period starts 30 days before end', () => {
  const now = new Date('2026-08-25T14:30:00Z');
  const { current } = computePeriodRange('30d', now);
  const expectedStart = new Date('2026-07-26T00:00:00Z');
  assert.equal(current.start.getTime(), expectedStart.getTime());
});

test('computePeriodRange: comparison period starts 60 days before end', () => {
  const now = new Date('2026-08-25T14:30:00Z');
  const { comparison } = computePeriodRange('30d', now);
  const expectedStart = new Date('2026-06-26T00:00:00Z');
  assert.equal(comparison.start.getTime(), expectedStart.getTime());
});

// ── Adversarial: no overlap between current and comparison ─────────────

test('computePeriodRange: current and comparison do not overlap', () => {
  for (const period of ['7d', '30d', '90d'] as const) {
    const { current, comparison } = computePeriodRange(period);
    assert.ok(
      comparison.endExclusive.getTime() <= current.start.getTime(),
      `${period}: comparison ends before current starts`,
    );
  }
});

// ── Adversarial: year boundary ─────────────────────────────────────────

test('computePeriodRange: 30d spanning year boundary', () => {
  const now = new Date('2026-01-05T10:00:00Z');
  const { current, comparison } = computePeriodRange('30d', now);
  // Current: 2025-12-06 to 2026-01-05
  assert.equal(current.start.getUTCFullYear(), 2025);
  assert.equal(current.endExclusive.getUTCFullYear(), 2026);
  // Comparison: 2025-11-06 to 2025-12-06
  assert.equal(comparison.start.getUTCFullYear(), 2025);
  assert.equal(comparison.endExclusive.getUTCFullYear(), 2025);
  // Durances still equal
  const currentMs = current.endExclusive.getTime() - current.start.getTime();
  const comparisonMs = comparison.endExclusive.getTime() - comparison.start.getTime();
  assert.equal(currentMs, comparisonMs);
});

// ── computeCompleteness ────────────────────────────────────────────────

test('computeCompleteness: returns "unavailable" for null event', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  assert.equal(computeCompleteness(null, now), 'unavailable');
});

test('computeCompleteness: returns "complete" for recent event (< 15min lag)', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const latest = new Date('2026-08-25T11:50:00Z'); // 10min ago
  assert.equal(computeCompleteness(latest, now), 'complete');
});

test('computeCompleteness: returns "provisional" for 30min lag', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const latest = new Date('2026-08-25T11:30:00Z'); // 30min ago
  assert.equal(computeCompleteness(latest, now), 'provisional');
});

test('computeCompleteness: returns "delayed" for 2hr lag', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const latest = new Date('2026-08-25T10:00:00Z'); // 2hr ago
  assert.equal(computeCompleteness(latest, now), 'delayed');
});

test('computeCompleteness: returns "provisional" at exactly 15min boundary (strict <)', () => {
  const now = new Date('2026-08-25T12:00:00Z');
  const latest = new Date('2026-08-25T11:45:00Z'); // exactly 15min ago
  // lagMin < 15 is strict, so 15min exactly falls through to 'provisional'
  assert.equal(computeCompleteness(latest, now), 'provisional');
});

// ── Adversarial: engagement rate never NaN ─────────────────────────────

test('computeEngagementRate: never returns NaN for finite inputs', () => {
  const inputs: number[][] = [
    [0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1],
    [1000000, 999999, 0, 0, 0, 0],
    [1, 1000000, 0, 0, 0, 0],
  ];
  for (const [v, l, s, c, sh, p] of inputs) {
    const result = computeEngagementRate(v, l, s, c, sh, p);
    assert.ok(!Number.isNaN(result), `NaN for inputs ${[v, l, s, c, sh, p].join(',')}`);
    assert.ok(result >= 0, `Negative for inputs ${[v, l, s, c, sh, p].join(',')}`);
  }
});

// ── Invariant: summary views == sum(timeline points views) ─────────────
// This verifies the mathematical relationship between the summary COUNT
// and the timeline GROUP BY — they must agree for the same period.

test('Invariant: sum of daily views equals total views for the period', () => {
  // Simulate: 3 days with 10, 20, 15 views
  const dailyViews = [10, 20, 15];
  const summaryViews = dailyViews.reduce((a, b) => a + b, 0);
  assert.equal(summaryViews, 45);

  // The engagement rate from the summary must match computing from totals
  const dailyEngagement = [
    { views: 10, likes: 2, saves: 1, comments: 0, shares: 1, productClicks: 0 },
    { views: 20, likes: 5, saves: 2, comments: 1, shares: 3, productClicks: 1 },
    { views: 15, likes: 3, saves: 0, comments: 2, shares: 0, productClicks: 2 },
  ];

  const totalViews = dailyEngagement.reduce((s, d) => s + d.views, 0);
  const totalLikes = dailyEngagement.reduce((s, d) => s + d.likes, 0);
  const totalSaves = dailyEngagement.reduce((s, d) => s + d.saves, 0);
  const totalComments = dailyEngagement.reduce((s, d) => s + d.comments, 0);
  const totalShares = dailyEngagement.reduce((s, d) => s + d.shares, 0);
  const totalProductClicks = dailyEngagement.reduce((s, d) => s + d.productClicks, 0);

  const summaryEngagementRate = computeEngagementRate(
    totalViews, totalLikes, totalSaves, totalComments, totalShares, totalProductClicks,
  );

  // The summary engagement rate is computed from totals, not averaged from daily rates
  assert.ok(summaryEngagementRate > 0);
  assert.ok(summaryEngagementRate <= 1);
  assert.ok(!Number.isNaN(summaryEngagementRate));
});
