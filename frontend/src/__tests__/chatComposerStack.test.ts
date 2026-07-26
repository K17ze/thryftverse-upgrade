import { describe, it, expect } from 'vitest';
import {
  resolveComposerStack,
  isSlotVisible,
  DEFAULT_COMPOSER_STACK_BUDGET_PIXELS,
  type ComposerStackSlotState,
} from '../utils/chatComposerStack';

/**
 * P0-8: Chat composer-stack height enforcement.
 *
 * The composer area can stack multiple contextual banners above the input
 * bar simultaneously. Stacking all of them at once pushes the input bar
 * off-screen on small devices. These tests cover the worst-case state
 * combinations and assert the resolver keeps the input bar usable.
 */

function slot(
  s: ComposerStackSlotState['slot'],
  visible: boolean,
  estimatedHeight = 50,
): ComposerStackSlotState {
  return { slot: s, visible, estimatedHeight };
}

describe('chatComposerStack — worst-case state combinations', () => {
  it('returns no visible slots when nothing is active', () => {
    const resolution = resolveComposerStack([
      slot('replyQuote', false),
      slot('undoBanner', false),
      slot('offlineBanner', false),
      slot('reactionPicker', false),
    ]);
    expect(resolution.visible).toEqual([]);
    expect(resolution.totalHeight).toBe(0);
  });

  it('keeps the highest-priority slot when only one is active', () => {
    const resolution = resolveComposerStack([
      slot('replyQuote', true, 56),
      slot('undoBanner', false),
      slot('offlineBanner', false),
      slot('reactionPicker', false),
    ]);
    expect(resolution.visible).toEqual(['replyQuote']);
    expect(resolution.totalHeight).toBe(56);
  });

  it('keeps all slots when cumulative height fits the budget', () => {
    const resolution = resolveComposerStack(
      [
        slot('replyQuote', true, 40),
        slot('undoBanner', true, 30),
        slot('offlineBanner', true, 20),
        slot('reactionPicker', true, 25),
      ],
      200,
    );
    expect(resolution.visible).toEqual([
      'replyQuote',
      'undoBanner',
      'offlineBanner',
      'reactionPicker',
    ]);
    expect(resolution.totalHeight).toBe(115);
  });

  it('suppresses the lowest-priority slots when the stack overflows the budget', () => {
    // All four slots active — total 184px, budget 100px.
    const resolution = resolveComposerStack(
      [
        slot('replyQuote', true, 56),
        slot('undoBanner', true, 44),
        slot('offlineBanner', true, 36),
        slot('reactionPicker', true, 48),
      ],
      100,
    );
    // replyQuote (56) fits; undoBanner (44) would push to 100 — fits exactly;
    // offlineBanner and reactionPicker are suppressed.
    expect(resolution.visible).toEqual(['replyQuote', 'undoBanner']);
    expect(resolution.suppressed.map((s) => s.slot)).toContain('offlineBanner');
    expect(resolution.suppressed.map((s) => s.slot)).toContain('reactionPicker');
    expect(resolution.totalHeight).toBe(100);
  });

  it('preserves the reply quote even when the budget is very small', () => {
    // Reply is priority 1 — it must survive even with a 30px budget.
    const resolution = resolveComposerStack(
      [
        slot('replyQuote', true, 56),
        slot('undoBanner', true, 44),
        slot('offlineBanner', true, 36),
        slot('reactionPicker', true, 48),
      ],
      30,
    );
    expect(resolution.visible).toContain('replyQuote');
    // Everything else is suppressed because adding any would overflow.
    expect(resolution.visible).toHaveLength(1);
  });

  it('respects priority order: undo banner beats offline banner when budget is tight', () => {
    const resolution = resolveComposerStack(
      [
        slot('replyQuote', false),
        slot('undoBanner', true, 50),
        slot('offlineBanner', true, 50),
        slot('reactionPicker', false),
      ],
      60,
    );
    expect(resolution.visible).toEqual(['undoBanner']);
    expect(resolution.suppressed.find((s) => s.slot === 'offlineBanner')?.reason).toBe('budget');
  });

  it('default budget is finite and small enough to protect the input bar', () => {
    expect(DEFAULT_COMPOSER_STACK_BUDGET_PIXELS).toBeGreaterThan(0);
    expect(DEFAULT_COMPOSER_STACK_BUDGET_PIXELS).toBeLessThanOrEqual(160);
  });

  it('isSlotVisible returns false for slots not in the resolution', () => {
    const resolution = resolveComposerStack([slot('replyQuote', true, 40)], 100);
    expect(isSlotVisible(resolution, 'replyQuote')).toBe(true);
    expect(isSlotVisible(resolution, 'offlineBanner')).toBe(false);
  });

  it('handles the simultaneous worst-case: reply + reaction + offline + undo all active', () => {
    // This is the exact combination P0-8 calls out as risky. The resolver
    // must not let all four render at once on a small device.
    const resolution = resolveComposerStack(
      [
        slot('replyQuote', true, 56),
        slot('undoBanner', true, 44),
        slot('offlineBanner', true, 36),
        slot('reactionPicker', true, 48),
      ],
      DEFAULT_COMPOSER_STACK_BUDGET_PIXELS,
    );
    // The default budget (120) fits reply + undo (100) but not offline (136).
    expect(resolution.visible).toContain('replyQuote');
    expect(resolution.visible).toContain('undoBanner');
    expect(resolution.visible).not.toContain('reactionPicker');
    expect(resolution.totalHeight).toBeLessThanOrEqual(DEFAULT_COMPOSER_STACK_BUDGET_PIXELS);
  });

  it('records not_visible slots in suppressed with reason "not_visible"', () => {
    const resolution = resolveComposerStack(
      [
        slot('replyQuote', true, 40),
        slot('undoBanner', false),
        slot('offlineBanner', false),
        slot('reactionPicker', false),
      ],
      100,
    );
    expect(resolution.suppressed.find((s) => s.slot === 'undoBanner')?.reason).toBe('not_visible');
    expect(resolution.suppressed.find((s) => s.slot === 'offlineBanner')?.reason).toBe('not_visible');
  });
});
