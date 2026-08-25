import React from 'react';
import {
  TAXONOMY_SEED,
  type TaxonomyCollection,
  type TaxonomyNode,
  type TaxonomyType,
} from '../contracts/taxonomy';
import { fetchTaxonomy } from '../services/taxonomyApi';

interface TaxonomyContextValue {
  categories: TaxonomyNode[];
  conditions: TaxonomyNode[];
  sizes: TaxonomyNode[];
  brands: TaxonomyNode[];
  colours: TaxonomyNode[];
  materials: TaxonomyNode[];
  isLoading: boolean;
}

const TaxonomyContext = React.createContext<TaxonomyContextValue | undefined>(undefined);

const SEED_VALUE: TaxonomyContextValue = {
  categories: TAXONOMY_SEED.categories,
  conditions: TAXONOMY_SEED.conditions,
  sizes: TAXONOMY_SEED.sizes,
  brands: TAXONOMY_SEED.brands,
  colours: TAXONOMY_SEED.colours,
  materials: TAXONOMY_SEED.materials,
  isLoading: true,
};

export function TaxonomyProvider({ children }: { children: React.ReactNode }) {
  const [taxonomy, setTaxonomy] = React.useState<TaxonomyCollection>(TAXONOMY_SEED);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const result = await fetchTaxonomy();
      if (!isMounted) return;
      setTaxonomy(result);
      setIsLoading(false);
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = React.useMemo<TaxonomyContextValue>(
    () => ({
      categories: taxonomy.categories,
      conditions: taxonomy.conditions,
      sizes: taxonomy.sizes,
      brands: taxonomy.brands,
      colours: taxonomy.colours,
      materials: taxonomy.materials,
      isLoading,
    }),
    [taxonomy, isLoading],
  );

  return (
    <TaxonomyContext.Provider value={value}>
      {children}
    </TaxonomyContext.Provider>
  );
}

export function useTaxonomy(): TaxonomyContextValue {
  const context = React.useContext(TaxonomyContext);
  if (!context) {
    throw new Error('useTaxonomy must be used within TaxonomyProvider');
  }
  return context;
}

export interface TaxonomyOption {
  label: string;
  value: string;
}

export function useTaxonomyOptions(type: TaxonomyType): TaxonomyOption[] {
  const { categories, conditions, sizes, brands, colours, materials } = useTaxonomy();

  return React.useMemo(() => {
    let nodes: TaxonomyNode[];
    switch (type) {
      case 'category':
        nodes = categories;
        break;
      case 'condition':
        nodes = conditions;
        break;
      case 'size':
        nodes = sizes;
        break;
      case 'brand':
        nodes = brands;
        break;
      case 'colour':
        nodes = colours;
        break;
      case 'material':
        nodes = materials;
        break;
      default:
        nodes = [];
    }
    return nodes.map((node) => ({ label: node.name, value: node.displayKey }));
  }, [type, categories, conditions, sizes, brands, colours, materials]);
}

export function useCategorySubcategories(parentId: string): TaxonomyNode[] {
  const { categories } = useTaxonomy();

  return React.useMemo(
    () => categories.filter((node) => node.parentId === parentId),
    [categories, parentId],
  );
}
