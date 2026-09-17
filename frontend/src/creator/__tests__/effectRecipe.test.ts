/**
 * Regression: registry ("AI") effects previously persisted as
 * `{ type: 'filter', id: 'ai:<id>', amount }` — an id outside the 10
 * named FILTER presets — so every surface resolved them to identity and
 * the authored effect silently dropped in preview AND export. The fix
 * bakes the effect's render(1) recipe onto the persisted node.
 */
import { describe, it, expect } from 'vitest';
import { evaluateCompositionEffectStack } from '../core/playback/EffectEvaluator';
import { buildFilterEffectNode } from '../tools/effects/filterNode';
import { getAllEffects } from '../tools/effects/AIEffectRegistry';
import type { EffectNode } from '../core/projectStore/composition';

const IDENTITY = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

describe('buildFilterEffectNode', () => {
  it('bakes a recipe for registry (ai:) effect ids', () => {
    const effect = getAllEffects()[0];
    expect(effect).toBeDefined();
    const node = buildFilterEffectNode(`ai:${effect.id}`, 0.8);
    expect(node.type).toBe('filter');
    if (node.type !== 'filter') return;
    expect(node.id).toBe(`ai:${effect.id}`);
    expect(node.amount).toBe(0.8);
    expect(node.recipe).toBeDefined();
    expect(node.recipe!.length).toBeGreaterThan(0);
  });

  it('bakes a recipe for bare registry ids too', () => {
    const effect = getAllEffects()[0];
    const node = buildFilterEffectNode(effect.id);
    if (node.type !== 'filter') return;
    expect(node.recipe?.length).toBeGreaterThan(0);
  });

  it('leaves named presets recipe-less (they resolve by id)', () => {
    const node = buildFilterEffectNode('warm');
    if (node.type !== 'filter') return;
    expect(node.recipe).toBeUndefined();
  });

  it('leaves unknown ids recipe-less (fail closed)', () => {
    const node = buildFilterEffectNode('definitely-not-an-effect');
    if (node.type !== 'filter') return;
    expect(node.recipe).toBeUndefined();
  });
});

describe('evaluateCompositionEffectStack — recipe fold', () => {
  it('a recipe-bearing filter node produces a non-identity result', () => {
    // Pick a registry effect whose render(1) emits at least one matrix
    // node so the fold produces a real colour matrix.
    const effect = getAllEffects().find((e) =>
      e.render(1).some((n) => n.type === 'matrix'),
    );
    expect(effect).toBeDefined();
    const node = buildFilterEffectNode(`ai:${effect!.id}`);
    const result = evaluateCompositionEffectStack([node], 1);
    expect(result.colorMatrix).toBeDefined();
    expect(result.colorMatrix).not.toEqual(IDENTITY);
  });

  it('recipe blur/vignette/grain nodes surface in the evaluated result', () => {
    const node: EffectNode = {
      type: 'filter',
      id: 'ai:test',
      amount: 1,
      recipe: [
        { type: 'blur', radius: 4 },
        { type: 'vignette', amount: 0.6 },
        { type: 'grain', amount: 0.3 },
      ],
    };
    const result = evaluateCompositionEffectStack([node], 1);
    expect(result.blurRadius).toBeCloseTo(4, 5);
    expect(result.vignetteAmount).toBeCloseTo(0.6, 5);
    expect(result.grainAmount).toBeCloseTo(0.3, 5);
  });

  it('the filter amount scales recipe matrix/blur/vignette contributions', () => {
    const half: EffectNode = {
      type: 'filter',
      id: 'ai:test',
      amount: 0.5,
      recipe: [{ type: 'vignette', amount: 0.8 }],
    };
    const result = evaluateCompositionEffectStack([half], 1);
    expect(result.vignetteAmount).toBeCloseTo(0.4, 5);
  });

  it('a recipe adjust node folds its vignette field scaled by amount', () => {
    const node: EffectNode = {
      type: 'filter',
      id: 'ai:test',
      amount: 0.5,
      recipe: [{ type: 'adjust', saturation: 0.5, vignette: 0.4 }],
    };
    const result = evaluateCompositionEffectStack([node], 1);
    expect(result.colorMatrix).toBeDefined();
    expect(result.vignetteAmount).toBeCloseTo(0.2, 5);
  });

  it('legacy ai: ids without a recipe still fail closed to identity', () => {
    // Pre-recipe documents carry only { id, amount } — they resolve to
    // identity rather than throwing.
    const node: EffectNode = { type: 'filter', id: 'ai:legacy', amount: 1 };
    const result = evaluateCompositionEffectStack([node], 1);
    expect(result.colorMatrix).toBeUndefined();
    expect(result.blurRadius).toBeUndefined();
  });
});
