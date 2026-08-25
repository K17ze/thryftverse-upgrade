import { useTaxonomy } from '../context/TaxonomyContext';
import type { TaxonomyNode, TaxonomyType } from '../contracts/taxonomy';

export function useTaxonomyOptions(type: TaxonomyType): TaxonomyNode[] {
  const { categories, conditions, sizes, brands, colours, materials } = useTaxonomy();

  switch (type) {
    case 'category':
      return categories;
    case 'condition':
      return conditions;
    case 'size':
      return sizes;
    case 'brand':
      return brands;
    case 'colour':
      return colours;
    case 'material':
      return materials;
    default:
      return [];
  }
}

export interface CategoryTreeNode extends TaxonomyNode {
  children: CategoryTreeNode[];
}

export function useCategoryTree(): CategoryTreeNode[] {
  const { categories } = useTaxonomy();

  const roots = categories.filter((node) => node.parentId === null);
  const childrenByParent = new Map<string | null, TaxonomyNode[]>();
  for (const node of categories) {
    if (node.parentId === null) continue;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }

  const buildTree = (node: TaxonomyNode): CategoryTreeNode => ({
    ...node,
    children: (childrenByParent.get(node.id) ?? []).map(buildTree),
  });

  return roots
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(buildTree);
}
