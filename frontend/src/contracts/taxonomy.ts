export type TaxonomyType =
  | 'category'
  | 'condition'
  | 'size'
  | 'brand'
  | 'colour'
  | 'material';

export type ListingCondition = 'New with tags' | 'Very good' | 'Good' | 'Satisfactory';

export interface TaxonomyNode {
  id: string;
  name: string;
  displayKey: string;
  type: TaxonomyType;
  parentId: string | null;
  sortOrder: number;
  synonyms?: string[];
}

export interface TaxonomyCollection {
  categories: TaxonomyNode[];
  conditions: TaxonomyNode[];
  sizes: TaxonomyNode[];
  brands: TaxonomyNode[];
  colours: TaxonomyNode[];
  materials: TaxonomyNode[];
}

const categoryNodes: TaxonomyNode[] = [
  {
    id: 'women',
    name: 'Women',
    displayKey: 'women',
    type: 'category',
    parentId: null,
    sortOrder: 0,
  },
  { id: 'women-clothing', name: 'Clothing', displayKey: 'women-clothing', type: 'category', parentId: 'women', sortOrder: 0 },
  { id: 'women-shoes', name: 'Shoes', displayKey: 'women-shoes', type: 'category', parentId: 'women', sortOrder: 1 },
  { id: 'women-bags', name: 'Bags', displayKey: 'women-bags', type: 'category', parentId: 'women', sortOrder: 2 },
  { id: 'women-accessories', name: 'Accessories', displayKey: 'women-accessories', type: 'category', parentId: 'women', sortOrder: 3 },
  { id: 'women-beauty', name: 'Beauty', displayKey: 'women-beauty', type: 'category', parentId: 'women', sortOrder: 4 },

  {
    id: 'men',
    name: 'Men',
    displayKey: 'men',
    type: 'category',
    parentId: null,
    sortOrder: 1,
  },
  { id: 'men-clothing', name: 'Clothing', displayKey: 'men-clothing', type: 'category', parentId: 'men', sortOrder: 0 },
  { id: 'men-shoes', name: 'Shoes', displayKey: 'men-shoes', type: 'category', parentId: 'men', sortOrder: 1 },
  { id: 'men-accessories', name: 'Accessories', displayKey: 'men-accessories', type: 'category', parentId: 'men', sortOrder: 2 },
  { id: 'men-grooming', name: 'Grooming', displayKey: 'men-grooming', type: 'category', parentId: 'men', sortOrder: 3 },

  {
    id: 'designer',
    name: 'Designer',
    displayKey: 'designer',
    type: 'category',
    parentId: null,
    sortOrder: 2,
  },
  { id: 'designer-bags', name: 'Bags & Accessories', displayKey: 'designer-bags', type: 'category', parentId: 'designer', sortOrder: 0 },
  { id: 'designer-clothing', name: 'Clothing', displayKey: 'designer-clothing', type: 'category', parentId: 'designer', sortOrder: 1 },
  { id: 'designer-shoes', name: 'Shoes', displayKey: 'designer-shoes', type: 'category', parentId: 'designer', sortOrder: 2 },
  { id: 'designer-jewellery', name: 'Jewellery & Watches', displayKey: 'designer-jewellery', type: 'category', parentId: 'designer', sortOrder: 3 },

  {
    id: 'kids',
    name: 'Kids',
    displayKey: 'kids',
    type: 'category',
    parentId: null,
    sortOrder: 3,
  },
  { id: 'kids-clothing', name: 'Clothing', displayKey: 'kids-clothing', type: 'category', parentId: 'kids', sortOrder: 0 },
  { id: 'kids-shoes', name: 'Shoes', displayKey: 'kids-shoes', type: 'category', parentId: 'kids', sortOrder: 1 },
  { id: 'kids-toys', name: 'Toys & Games', displayKey: 'kids-toys', type: 'category', parentId: 'kids', sortOrder: 2 },
  { id: 'kids-accessories', name: 'Accessories', displayKey: 'kids-accessories', type: 'category', parentId: 'kids', sortOrder: 3 },

  {
    id: 'home',
    name: 'Home',
    displayKey: 'home',
    type: 'category',
    parentId: null,
    sortOrder: 4,
  },
  { id: 'home-kitchen-small', name: 'Small kitchen appliances', displayKey: 'home-kitchen-small', type: 'category', parentId: 'home', sortOrder: 0 },
  { id: 'home-kitchen-large', name: 'Large appliances', displayKey: 'home-kitchen-large', type: 'category', parentId: 'home', sortOrder: 1 },
  { id: 'home-cookware', name: 'Cookware & bakeware', displayKey: 'home-cookware', type: 'category', parentId: 'home', sortOrder: 2 },
  { id: 'home-tools', name: 'Kitchen tools', displayKey: 'home-tools', type: 'category', parentId: 'home', sortOrder: 3 },
  { id: 'home-tableware', name: 'Tableware', displayKey: 'home-tableware', type: 'category', parentId: 'home', sortOrder: 4 },
  { id: 'home-care', name: 'Household care', displayKey: 'home-care', type: 'category', parentId: 'home', sortOrder: 5 },
  { id: 'home-textiles', name: 'Textiles', displayKey: 'home-textiles', type: 'category', parentId: 'home', sortOrder: 6 },
  { id: 'home-accessories', name: 'Home accessories', displayKey: 'home-accessories', type: 'category', parentId: 'home', sortOrder: 7 },
  { id: 'home-office', name: 'Office supplies', displayKey: 'home-office', type: 'category', parentId: 'home', sortOrder: 8 },
  { id: 'home-celebrations', name: 'Celebrations & holidays', displayKey: 'home-celebrations', type: 'category', parentId: 'home', sortOrder: 9 },
  { id: 'home-diy', name: 'Tools & DIY', displayKey: 'home-diy', type: 'category', parentId: 'home', sortOrder: 10 },

  {
    id: 'electronics',
    name: 'Electronics',
    displayKey: 'electronics',
    type: 'category',
    parentId: null,
    sortOrder: 5,
  },
  { id: 'elec-gaming', name: 'Video games & consoles', displayKey: 'elec-gaming', type: 'category', parentId: 'electronics', sortOrder: 0 },
  { id: 'elec-computers', name: 'Computers & accessories', displayKey: 'elec-computers', type: 'category', parentId: 'electronics', sortOrder: 1 },
  { id: 'elec-phones', name: 'Mobile phones & communication', displayKey: 'elec-phones', type: 'category', parentId: 'electronics', sortOrder: 2 },
  { id: 'elec-audio', name: 'Audio, headphones & hi-fi', displayKey: 'elec-audio', type: 'category', parentId: 'electronics', sortOrder: 3 },
  { id: 'elec-cameras', name: 'Cameras & accessories', displayKey: 'elec-cameras', type: 'category', parentId: 'electronics', sortOrder: 4 },
  { id: 'elec-tablets', name: 'Tablets, e-readers & accessories', displayKey: 'elec-tablets', type: 'category', parentId: 'electronics', sortOrder: 5 },
  { id: 'elec-tv', name: 'TV & home cinema', displayKey: 'elec-tv', type: 'category', parentId: 'electronics', sortOrder: 6 },
  { id: 'elec-beauty', name: 'Beauty & personal care electronics', displayKey: 'elec-beauty', type: 'category', parentId: 'electronics', sortOrder: 7 },
  { id: 'elec-wearables', name: 'Wearables', displayKey: 'elec-wearables', type: 'category', parentId: 'electronics', sortOrder: 8 },
  { id: 'elec-other', name: 'Other devices & accessories', displayKey: 'elec-other', type: 'category', parentId: 'electronics', sortOrder: 9 },

  {
    id: 'entertainment',
    name: 'Entertainment',
    displayKey: 'entertainment',
    type: 'category',
    parentId: null,
    sortOrder: 6,
  },
  { id: 'ent-books', name: 'Books', displayKey: 'ent-books', type: 'category', parentId: 'entertainment', sortOrder: 0 },
  { id: 'ent-magazines', name: 'Magazines', displayKey: 'ent-magazines', type: 'category', parentId: 'entertainment', sortOrder: 1 },
  { id: 'ent-music', name: 'Music', displayKey: 'ent-music', type: 'category', parentId: 'entertainment', sortOrder: 2 },
  { id: 'ent-video', name: 'Video', displayKey: 'ent-video', type: 'category', parentId: 'entertainment', sortOrder: 3 },

  {
    id: 'hobbies',
    name: 'Hobbies & collectables',
    displayKey: 'hobbies',
    type: 'category',
    parentId: null,
    sortOrder: 7,
    synonyms: ['hobbies & collectables'],
  },
  { id: 'hob-trading', name: 'Trading cards', displayKey: 'hob-trading', type: 'category', parentId: 'hobbies', sortOrder: 0 },
  { id: 'hob-board', name: 'Board games', displayKey: 'hob-board', type: 'category', parentId: 'hobbies', sortOrder: 1 },
  { id: 'hob-puzzles', name: 'Puzzles', displayKey: 'hob-puzzles', type: 'category', parentId: 'hobbies', sortOrder: 2 },
  { id: 'hob-tabletop', name: 'Tabletop & miniature gaming', displayKey: 'hob-tabletop', type: 'category', parentId: 'hobbies', sortOrder: 3 },
  { id: 'hob-memorabilia', name: 'Memorabilia', displayKey: 'hob-memorabilia', type: 'category', parentId: 'hobbies', sortOrder: 4 },
  { id: 'hob-coins', name: 'Coins & banknotes', displayKey: 'hob-coins', type: 'category', parentId: 'hobbies', sortOrder: 5 },
  { id: 'hob-stamps', name: 'Stamps', displayKey: 'hob-stamps', type: 'category', parentId: 'hobbies', sortOrder: 6 },
  { id: 'hob-postcards', name: 'Postcards', displayKey: 'hob-postcards', type: 'category', parentId: 'hobbies', sortOrder: 7 },
  { id: 'hob-music', name: 'Musical instruments & gear', displayKey: 'hob-music', type: 'category', parentId: 'hobbies', sortOrder: 8 },
  { id: 'hob-arts', name: 'Arts & crafts', displayKey: 'hob-arts', type: 'category', parentId: 'hobbies', sortOrder: 9 },
  { id: 'hob-storage', name: 'Collectables storage', displayKey: 'hob-storage', type: 'category', parentId: 'hobbies', sortOrder: 10 },

  {
    id: 'sports',
    name: 'Sports',
    displayKey: 'sports',
    type: 'category',
    parentId: null,
    sortOrder: 8,
    synonyms: ['sportswear'],
  },
  { id: 'spt-cycling', name: 'Cycling', displayKey: 'spt-cycling', type: 'category', parentId: 'sports', sortOrder: 0 },
  { id: 'spt-fitness', name: 'Fitness, running & yoga', displayKey: 'spt-fitness', type: 'category', parentId: 'sports', sortOrder: 1 },
  { id: 'spt-outdoor', name: 'Outdoor sports', displayKey: 'spt-outdoor', type: 'category', parentId: 'sports', sortOrder: 2 },
  { id: 'spt-water', name: 'Water sports', displayKey: 'spt-water', type: 'category', parentId: 'sports', sortOrder: 3 },
  { id: 'spt-team', name: 'Team sports', displayKey: 'spt-team', type: 'category', parentId: 'sports', sortOrder: 4 },
  { id: 'spt-racquet', name: 'Racquet sports', displayKey: 'spt-racquet', type: 'category', parentId: 'sports', sortOrder: 5 },
  { id: 'spt-golf', name: 'Golf', displayKey: 'spt-golf', type: 'category', parentId: 'sports', sortOrder: 6 },
  { id: 'spt-equestrian', name: 'Equestrian', displayKey: 'spt-equestrian', type: 'category', parentId: 'sports', sortOrder: 7 },
  { id: 'spt-skate', name: 'Skateboards & scooters', displayKey: 'spt-skate', type: 'category', parentId: 'sports', sortOrder: 8 },
  { id: 'spt-boxing', name: 'Boxing & martial arts', displayKey: 'spt-boxing', type: 'category', parentId: 'sports', sortOrder: 9 },
  { id: 'spt-casual', name: 'Casual sports & games', displayKey: 'spt-casual', type: 'category', parentId: 'sports', sortOrder: 10 },

  {
    id: 'cars',
    name: 'Cars',
    displayKey: 'cars',
    type: 'category',
    parentId: null,
    sortOrder: 9,
  },
  {
    id: 'yachts',
    name: 'Yachts',
    displayKey: 'yachts',
    type: 'category',
    parentId: null,
    sortOrder: 10,
  },
];

const conditionNodes: TaxonomyNode[] = [
  { id: 'condition-new-with-tags', name: 'New with tags', displayKey: 'New with tags', type: 'condition', parentId: null, sortOrder: 0 },
  { id: 'condition-very-good', name: 'Very good', displayKey: 'Very good', type: 'condition', parentId: null, sortOrder: 1 },
  { id: 'condition-good', name: 'Good', displayKey: 'Good', type: 'condition', parentId: null, sortOrder: 2 },
  { id: 'condition-satisfactory', name: 'Satisfactory', displayKey: 'Satisfactory', type: 'condition', parentId: null, sortOrder: 3 },
];

const sizeNodes: TaxonomyNode[] = [
  { id: 'size-xxs', name: 'XXS', displayKey: 'XXS', type: 'size', parentId: null, sortOrder: 0 },
  { id: 'size-xs', name: 'XS', displayKey: 'XS', type: 'size', parentId: null, sortOrder: 1 },
  { id: 'size-s', name: 'S', displayKey: 'S', type: 'size', parentId: null, sortOrder: 2 },
  { id: 'size-m', name: 'M', displayKey: 'M', type: 'size', parentId: null, sortOrder: 3 },
  { id: 'size-l', name: 'L', displayKey: 'L', type: 'size', parentId: null, sortOrder: 4 },
  { id: 'size-xl', name: 'XL', displayKey: 'XL', type: 'size', parentId: null, sortOrder: 5 },
  { id: 'size-xxl', name: 'XXL', displayKey: 'XXL', type: 'size', parentId: null, sortOrder: 6 },
  { id: 'size-uk-6', name: 'UK 6', displayKey: 'UK 6', type: 'size', parentId: null, sortOrder: 7 },
  { id: 'size-uk-8', name: 'UK 8', displayKey: 'UK 8', type: 'size', parentId: null, sortOrder: 8 },
  { id: 'size-uk-10', name: 'UK 10', displayKey: 'UK 10', type: 'size', parentId: null, sortOrder: 9 },
  { id: 'size-uk-12', name: 'UK 12', displayKey: 'UK 12', type: 'size', parentId: null, sortOrder: 10 },
  { id: 'size-one-size', name: 'One size', displayKey: 'One size', type: 'size', parentId: null, sortOrder: 11, synonyms: ['One Size'] },
];

const brandNodes: TaxonomyNode[] = [
  { id: 'brand-nike', name: 'Nike', displayKey: 'Nike', type: 'brand', parentId: null, sortOrder: 0 },
  { id: 'brand-adidas', name: 'Adidas', displayKey: 'Adidas', type: 'brand', parentId: null, sortOrder: 1 },
  { id: 'brand-zara', name: 'Zara', displayKey: 'Zara', type: 'brand', parentId: null, sortOrder: 2 },
  { id: 'brand-hm', name: 'H&M', displayKey: 'H&M', type: 'brand', parentId: null, sortOrder: 3, synonyms: ['hm'] },
  { id: 'brand-gucci', name: 'Gucci', displayKey: 'Gucci', type: 'brand', parentId: null, sortOrder: 4 },
  { id: 'brand-prada', name: 'Prada', displayKey: 'Prada', type: 'brand', parentId: null, sortOrder: 5 },
  { id: 'brand-uniqlo', name: 'Uniqlo', displayKey: 'Uniqlo', type: 'brand', parentId: null, sortOrder: 6 },
  { id: 'brand-levis', name: "Levi's", displayKey: "Levi's", type: 'brand', parentId: null, sortOrder: 7, synonyms: ['levi', 'levis'] },
  { id: 'brand-asos', name: 'ASOS', displayKey: 'ASOS', type: 'brand', parentId: null, sortOrder: 8 },
  { id: 'brand-puma', name: 'Puma', displayKey: 'Puma', type: 'brand', parentId: null, sortOrder: 9 },
  { id: 'brand-reebok', name: 'Reebok', displayKey: 'Reebok', type: 'brand', parentId: null, sortOrder: 10 },
  { id: 'brand-new-balance', name: 'New Balance', displayKey: 'New Balance', type: 'brand', parentId: null, sortOrder: 11 },
  { id: 'brand-asics', name: 'Asics', displayKey: 'Asics', type: 'brand', parentId: null, sortOrder: 12 },
  { id: 'brand-louis-vuitton', name: 'Louis Vuitton', displayKey: 'Louis Vuitton', type: 'brand', parentId: null, sortOrder: 13, synonyms: ['lv'] },
  { id: 'brand-burberry', name: 'Burberry', displayKey: 'Burberry', type: 'brand', parentId: null, sortOrder: 14 },
  { id: 'brand-balenciaga', name: 'Balenciaga', displayKey: 'Balenciaga', type: 'brand', parentId: null, sortOrder: 15 },
  { id: 'brand-givenchy', name: 'Givenchy', displayKey: 'Givenchy', type: 'brand', parentId: null, sortOrder: 16 },
  { id: 'brand-valentino', name: 'Valentino', displayKey: 'Valentino', type: 'brand', parentId: null, sortOrder: 17 },
  { id: 'brand-saint-laurent', name: 'Saint Laurent', displayKey: 'Saint Laurent', type: 'brand', parentId: null, sortOrder: 18, synonyms: ['ysl'] },
  { id: 'brand-carhartt', name: 'Carhartt', displayKey: 'Carhartt', type: 'brand', parentId: null, sortOrder: 19 },
  { id: 'brand-patagonia', name: 'Patagonia', displayKey: 'Patagonia', type: 'brand', parentId: null, sortOrder: 20 },
  { id: 'brand-the-north-face', name: 'The North Face', displayKey: 'The North Face', type: 'brand', parentId: null, sortOrder: 21, synonyms: ['north face', 'tnf'] },
  { id: 'brand-supreme', name: 'Supreme', displayKey: 'Supreme', type: 'brand', parentId: null, sortOrder: 22 },
  { id: 'brand-stussy', name: 'Stussy', displayKey: 'Stussy', type: 'brand', parentId: null, sortOrder: 23 },
  { id: 'brand-palace', name: 'Palace', displayKey: 'Palace', type: 'brand', parentId: null, sortOrder: 24 },
  { id: 'brand-mango', name: 'Mango', displayKey: 'Mango', type: 'brand', parentId: null, sortOrder: 25 },
  { id: 'brand-topshop', name: 'Topshop', displayKey: 'Topshop', type: 'brand', parentId: null, sortOrder: 26 },
  { id: 'brand-wrangler', name: 'Wrangler', displayKey: 'Wrangler', type: 'brand', parentId: null, sortOrder: 27 },
  { id: 'brand-ralph-lauren', name: 'Ralph Lauren', displayKey: 'Ralph Lauren', type: 'brand', parentId: null, sortOrder: 28 },
  { id: 'brand-off-white', name: 'Off-White', displayKey: 'Off-White', type: 'brand', parentId: null, sortOrder: 29 },
  { id: 'brand-stone-island', name: 'Stone Island', displayKey: 'Stone Island', type: 'brand', parentId: null, sortOrder: 30 },
  { id: 'brand-converse', name: 'Converse', displayKey: 'Converse', type: 'brand', parentId: null, sortOrder: 31 },
  { id: 'brand-vans', name: 'Vans', displayKey: 'Vans', type: 'brand', parentId: null, sortOrder: 32 },
  { id: 'brand-chanel', name: 'Chanel', displayKey: 'Chanel', type: 'brand', parentId: null, sortOrder: 33 },
  { id: 'brand-hermes', name: 'Hermès', displayKey: 'Hermès', type: 'brand', parentId: null, sortOrder: 34 },
  { id: 'brand-dior', name: 'Dior', displayKey: 'Dior', type: 'brand', parentId: null, sortOrder: 35 },
  { id: 'brand-bottega-veneta', name: 'Bottega Veneta', displayKey: 'Bottega Veneta', type: 'brand', parentId: null, sortOrder: 36 },
  { id: 'brand-versace', name: 'Versace', displayKey: 'Versace', type: 'brand', parentId: null, sortOrder: 37 },
  { id: 'brand-other', name: 'Other', displayKey: 'Other', type: 'brand', parentId: null, sortOrder: 38 },
];

// Curated luxury classification. Lives in the taxonomy contract so the
// luxury heuristic has a single source of truth alongside the brand nodes
// it classifies — not a parallel array in a screen utility file.
const LUXURY_BRAND_IDS: ReadonlySet<string> = new Set([
  'brand-gucci',
  'brand-prada',
  'brand-louis-vuitton',
  'brand-chanel',
  'brand-hermes',
  'brand-dior',
  'brand-balenciaga',
  'brand-bottega-veneta',
  'brand-saint-laurent',
  'brand-burberry',
  'brand-versace',
  'brand-givenchy',
  'brand-valentino',
]);

export const LUXURY_BRAND_NAMES: readonly string[] = brandNodes
  .filter((node) => LUXURY_BRAND_IDS.has(node.id))
  .map((node) => node.name);

const colourNodes: TaxonomyNode[] = [
  { id: 'colour-black', name: 'Black', displayKey: 'black', type: 'colour', parentId: null, sortOrder: 0 },
  { id: 'colour-white', name: 'White', displayKey: 'white', type: 'colour', parentId: null, sortOrder: 1 },
  { id: 'colour-navy', name: 'Navy', displayKey: 'navy', type: 'colour', parentId: null, sortOrder: 2 },
  { id: 'colour-blue', name: 'Blue', displayKey: 'blue', type: 'colour', parentId: null, sortOrder: 3 },
  { id: 'colour-red', name: 'Red', displayKey: 'red', type: 'colour', parentId: null, sortOrder: 4 },
  { id: 'colour-green', name: 'Green', displayKey: 'green', type: 'colour', parentId: null, sortOrder: 5 },
  { id: 'colour-brown', name: 'Brown', displayKey: 'brown', type: 'colour', parentId: null, sortOrder: 6 },
  { id: 'colour-beige', name: 'Beige', displayKey: 'beige', type: 'colour', parentId: null, sortOrder: 7 },
  { id: 'colour-grey', name: 'Grey', displayKey: 'grey', type: 'colour', parentId: null, sortOrder: 8, synonyms: ['gray'] },
  { id: 'colour-cream', name: 'Cream', displayKey: 'cream', type: 'colour', parentId: null, sortOrder: 9 },
  { id: 'colour-olive', name: 'Olive', displayKey: 'olive', type: 'colour', parentId: null, sortOrder: 10 },
  { id: 'colour-burgundy', name: 'Burgundy', displayKey: 'burgundy', type: 'colour', parentId: null, sortOrder: 11, synonyms: ['maroon'] },
  { id: 'colour-pink', name: 'Pink', displayKey: 'pink', type: 'colour', parentId: null, sortOrder: 12 },
  { id: 'colour-yellow', name: 'Yellow', displayKey: 'yellow', type: 'colour', parentId: null, sortOrder: 13 },
  { id: 'colour-orange', name: 'Orange', displayKey: 'orange', type: 'colour', parentId: null, sortOrder: 14 },
  { id: 'colour-purple', name: 'Purple', displayKey: 'purple', type: 'colour', parentId: null, sortOrder: 15 },
  { id: 'colour-khaki', name: 'Khaki', displayKey: 'khaki', type: 'colour', parentId: null, sortOrder: 16 },
  { id: 'colour-tan', name: 'Tan', displayKey: 'tan', type: 'colour', parentId: null, sortOrder: 17 },
];

const materialNodes: TaxonomyNode[] = [];

export const CONDITION_NAMES: readonly string[] = conditionNodes.map(n => n.name);

export const TAXONOMY_SEED: TaxonomyCollection = {
  categories: categoryNodes,
  conditions: conditionNodes,
  sizes: sizeNodes,
  brands: brandNodes,
  colours: colourNodes,
  materials: materialNodes,
};
