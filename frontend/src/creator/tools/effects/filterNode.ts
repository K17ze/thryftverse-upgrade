/**
 * filterNode — bridge between the effect registry (render-graph
 * EffectNodes) and the persisted composition `filter` node.
 *
 * The 10 named flagship presets resolve by `id` at render time
 * (FILTER_PRESET_MATRICES / resolveColorMatrix). Registry effects
 * (`AIEffectRegistry`) have ids outside that set, so persisting only
 * `{ type: 'filter', id, amount }` fails closed to identity on every
 * surface — the authored effect silently drops in preview AND export.
 *
 * `buildFilterEffectNode` bakes the effect's `render(1)` recipe onto the
 * persisted node so unknown ids still render their real authored result.
 * Named presets get no recipe — they continue to resolve by id.
 */
import { getEffect } from './AIEffectRegistry';
import type { EffectNode as RenderNode } from './EffectTypes';
import type {
  EffectNode as CompositionEffectNode,
  RecipeNode,
} from '../../core/projectStore/composition';

function toRecipeNode(node: RenderNode): RecipeNode | null {
  switch (node.type) {
    case 'matrix':
      return node.matrix.length === 20
        ? { type: 'matrix', matrix: [...node.matrix] }
        : null;
    case 'adjust': {
      const { type: _t, ...fields } = node;
      return { type: 'adjust', ...fields };
    }
    case 'blur':
      return { type: 'blur', radius: node.radius };
    case 'grain':
      return { type: 'grain', amount: node.amount };
    default:
      // lut / mask nodes have no persisted recipe representation.
      return null;
  }
}

/**
 * Build the persisted `filter` effect node for a preset/effect id.
 * Attaches the baked recipe when the id belongs to a registry effect.
 * Registry effects are stored under the `ai:` namespace — the prefix is
 * stripped for the registry lookup but preserved on the persisted id so
 * apply/remove semantics keep working.
 */
export function buildFilterEffectNode(
  id: string,
  amount = 1,
): CompositionEffectNode {
  const definition = getEffect(id.startsWith('ai:') ? id.slice(3) : id);
  if (!definition) {
    return { type: 'filter', id, amount };
  }
  const recipe = definition
    .render(1)
    .map(toRecipeNode)
    .filter((n): n is RecipeNode => n !== null);
  return recipe.length > 0
    ? { type: 'filter', id, amount, recipe }
    : { type: 'filter', id, amount };
}
