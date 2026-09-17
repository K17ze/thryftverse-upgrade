import { describe, expect, it } from 'vitest';

import { buildListingSortPlan } from '../lib/listingSort.js';

describe('buildListingSortPlan', () => {
  it('orders newest by created_at desc with deterministic id tiebreak', () => {
    const plan = buildListingSortPlan('newest', null, 0);
    expect(plan.orderBy).toBe('l.created_at DESC, l.id DESC');
    expect(plan.cursorCondition).toBeNull();
    expect(plan.cursorArgs).toEqual([]);
  });

  it('keyset-paginates price_asc forward', () => {
    const plan = buildListingSortPlan('price_asc', { sortValue: 42.5, id: 'l9' }, 3);
    expect(plan.cursorCondition).toBe('(l.price_gbp, l.id) > ($4, $5)');
    expect(plan.cursorArgs).toEqual([42.5, 'l9']);
  });

  it('keyset-paginates price_desc backward on price', () => {
    const plan = buildListingSortPlan('price_desc', { sortValue: 10, id: 'l2' }, 0);
    expect(plan.cursorCondition).toBe('(l.price_gbp, l.id) < ($1, $2)');
    expect(plan.cursorArgs).toEqual([10, 'l2']);
  });

  it('most_liked paginates on the coalesced like count', () => {
    const plan = buildListingSortPlan('most_liked', { sortValue: 7, id: 'l4' }, 1);
    expect(plan.orderBy).toBe('COALESCE(li.like_count, 0) DESC, l.id DESC');
    expect(plan.cursorCondition).toBe('(COALESCE(li.like_count, 0), l.id) < ($2, $3)');
    expect(plan.cursorArgs).toEqual([7, 'l4']);
  });

  it('recommended shares the most_liked ordering', () => {
    const plan = buildListingSortPlan('recommended', null, 0);
    expect(plan.orderBy).toBe('COALESCE(li.like_count, 0) DESC, l.id DESC');
  });

  it('ending_soon keeps the NULLS LAST tail reachable past a non-null cursor', () => {
    const plan = buildListingSortPlan('ending_soon', { sortValue: '2026-01-01T00:00:00Z', id: 'l1' }, 0);
    expect(plan.orderBy).toBe('a.ends_at ASC NULLS LAST, l.id ASC');
    // Null-auction rows sort after every non-null row — the predicate must
    // include them or the tail is unreachable.
    expect(plan.cursorCondition).toBe(
      '(a.ends_at IS NULL OR (a.ends_at, l.id) > ($1, $2))',
    );
  });

  it('ending_soon inside the null tail paginates on id only', () => {
    const plan = buildListingSortPlan('ending_soon', { sortValue: null, id: 'l7' }, 2);
    expect(plan.cursorCondition).toBe('a.ends_at IS NULL AND l.id > $3');
    expect(plan.cursorArgs).toEqual(['l7']);
  });

  it('newest keyset goes backward on created_at', () => {
    const plan = buildListingSortPlan('newest', { sortValue: '2026-01-01', id: 'l3' }, 0);
    expect(plan.cursorCondition).toBe('(l.created_at, l.id) < ($1, $2)');
  });

  it('offsets placeholders past already-bound args', () => {
    const plan = buildListingSortPlan('price_asc', { sortValue: 5, id: 'x' }, 6);
    expect(plan.cursorCondition).toContain('$7');
    expect(plan.cursorCondition).toContain('$8');
  });
});
