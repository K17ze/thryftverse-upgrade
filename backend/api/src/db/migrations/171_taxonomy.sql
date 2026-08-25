-- 171: Taxonomy single source of truth
--
-- Creates the taxonomy_nodes table that serves as the backend source of truth
-- for marketplace categories, conditions, sizes, brands, colours, and materials.
-- Seeds it with the same data as the frontend TAXONOMY_SEED fallback.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and ON CONFLICT (id) DO NOTHING.

CREATE TABLE IF NOT EXISTS taxonomy_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('category', 'condition', 'size', 'brand', 'colour', 'material')),
  parent_id TEXT REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  synonyms JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taxonomy_nodes_type_idx ON taxonomy_nodes (type, sort_order);
CREATE INDEX IF NOT EXISTS taxonomy_nodes_parent_idx ON taxonomy_nodes (parent_id);

-- ── Categories (top-level) ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('women', 'Women', 'women', 'category', NULL, 0, '[]'::jsonb),
  ('men', 'Men', 'men', 'category', NULL, 1, '[]'::jsonb),
  ('designer', 'Designer', 'designer', 'category', NULL, 2, '[]'::jsonb),
  ('kids', 'Kids', 'kids', 'category', NULL, 3, '[]'::jsonb),
  ('home', 'Home', 'home', 'category', NULL, 4, '[]'::jsonb),
  ('electronics', 'Electronics', 'electronics', 'category', NULL, 5, '[]'::jsonb),
  ('entertainment', 'Entertainment', 'entertainment', 'category', NULL, 6, '[]'::jsonb),
  ('hobbies', 'Hobbies & collectables', 'hobbies', 'category', NULL, 7, '["hobbies & collectables"]'::jsonb),
  ('sports', 'Sports', 'sports', 'category', NULL, 8, '["sportswear"]'::jsonb),
  ('cars', 'Cars', 'cars', 'category', NULL, 9, '[]'::jsonb),
  ('yachts', 'Yachts', 'yachts', 'category', NULL, 10, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Women subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('women-clothing', 'Clothing', 'women-clothing', 'category', 'women', 0, '[]'::jsonb),
  ('women-shoes', 'Shoes', 'women-shoes', 'category', 'women', 1, '[]'::jsonb),
  ('women-bags', 'Bags', 'women-bags', 'category', 'women', 2, '[]'::jsonb),
  ('women-accessories', 'Accessories', 'women-accessories', 'category', 'women', 3, '[]'::jsonb),
  ('women-beauty', 'Beauty', 'women-beauty', 'category', 'women', 4, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Men subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('men-clothing', 'Clothing', 'men-clothing', 'category', 'men', 0, '[]'::jsonb),
  ('men-shoes', 'Shoes', 'men-shoes', 'category', 'men', 1, '[]'::jsonb),
  ('men-accessories', 'Accessories', 'men-accessories', 'category', 'men', 2, '[]'::jsonb),
  ('men-grooming', 'Grooming', 'men-grooming', 'category', 'men', 3, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Designer subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('designer-bags', 'Bags & Accessories', 'designer-bags', 'category', 'designer', 0, '[]'::jsonb),
  ('designer-clothing', 'Clothing', 'designer-clothing', 'category', 'designer', 1, '[]'::jsonb),
  ('designer-shoes', 'Shoes', 'designer-shoes', 'category', 'designer', 2, '[]'::jsonb),
  ('designer-jewellery', 'Jewellery & Watches', 'designer-jewellery', 'category', 'designer', 3, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Kids subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('kids-clothing', 'Clothing', 'kids-clothing', 'category', 'kids', 0, '[]'::jsonb),
  ('kids-shoes', 'Shoes', 'kids-shoes', 'category', 'kids', 1, '[]'::jsonb),
  ('kids-toys', 'Toys & Games', 'kids-toys', 'category', 'kids', 2, '[]'::jsonb),
  ('kids-accessories', 'Accessories', 'kids-accessories', 'category', 'kids', 3, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Home subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('home-kitchen-small', 'Small kitchen appliances', 'home-kitchen-small', 'category', 'home', 0, '[]'::jsonb),
  ('home-kitchen-large', 'Large appliances', 'home-kitchen-large', 'category', 'home', 1, '[]'::jsonb),
  ('home-cookware', 'Cookware & bakeware', 'home-cookware', 'category', 'home', 2, '[]'::jsonb),
  ('home-tools', 'Kitchen tools', 'home-tools', 'category', 'home', 3, '[]'::jsonb),
  ('home-tableware', 'Tableware', 'home-tableware', 'category', 'home', 4, '[]'::jsonb),
  ('home-care', 'Household care', 'home-care', 'category', 'home', 5, '[]'::jsonb),
  ('home-textiles', 'Textiles', 'home-textiles', 'category', 'home', 6, '[]'::jsonb),
  ('home-accessories', 'Home accessories', 'home-accessories', 'category', 'home', 7, '[]'::jsonb),
  ('home-office', 'Office supplies', 'home-office', 'category', 'home', 8, '[]'::jsonb),
  ('home-celebrations', 'Celebrations & holidays', 'home-celebrations', 'category', 'home', 9, '[]'::jsonb),
  ('home-diy', 'Tools & DIY', 'home-diy', 'category', 'home', 10, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Electronics subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('elec-gaming', 'Video games & consoles', 'elec-gaming', 'category', 'electronics', 0, '[]'::jsonb),
  ('elec-computers', 'Computers & accessories', 'elec-computers', 'category', 'electronics', 1, '[]'::jsonb),
  ('elec-phones', 'Mobile phones & communication', 'elec-phones', 'category', 'electronics', 2, '[]'::jsonb),
  ('elec-audio', 'Audio, headphones & hi-fi', 'elec-audio', 'category', 'electronics', 3, '[]'::jsonb),
  ('elec-cameras', 'Cameras & accessories', 'elec-cameras', 'category', 'electronics', 4, '[]'::jsonb),
  ('elec-tablets', 'Tablets, e-readers & accessories', 'elec-tablets', 'category', 'electronics', 5, '[]'::jsonb),
  ('elec-tv', 'TV & home cinema', 'elec-tv', 'category', 'electronics', 6, '[]'::jsonb),
  ('elec-beauty', 'Beauty & personal care electronics', 'elec-beauty', 'category', 'electronics', 7, '[]'::jsonb),
  ('elec-wearables', 'Wearables', 'elec-wearables', 'category', 'electronics', 8, '[]'::jsonb),
  ('elec-other', 'Other devices & accessories', 'elec-other', 'category', 'electronics', 9, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Entertainment subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('ent-books', 'Books', 'ent-books', 'category', 'entertainment', 0, '[]'::jsonb),
  ('ent-magazines', 'Magazines', 'ent-magazines', 'category', 'entertainment', 1, '[]'::jsonb),
  ('ent-music', 'Music', 'ent-music', 'category', 'entertainment', 2, '[]'::jsonb),
  ('ent-video', 'Video', 'ent-video', 'category', 'entertainment', 3, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Hobbies & collectables subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('hob-trading', 'Trading cards', 'hob-trading', 'category', 'hobbies', 0, '[]'::jsonb),
  ('hob-board', 'Board games', 'hob-board', 'category', 'hobbies', 1, '[]'::jsonb),
  ('hob-puzzles', 'Puzzles', 'hob-puzzles', 'category', 'hobbies', 2, '[]'::jsonb),
  ('hob-tabletop', 'Tabletop & miniature gaming', 'hob-tabletop', 'category', 'hobbies', 3, '[]'::jsonb),
  ('hob-memorabilia', 'Memorabilia', 'hob-memorabilia', 'category', 'hobbies', 4, '[]'::jsonb),
  ('hob-coins', 'Coins & banknotes', 'hob-coins', 'category', 'hobbies', 5, '[]'::jsonb),
  ('hob-stamps', 'Stamps', 'hob-stamps', 'category', 'hobbies', 6, '[]'::jsonb),
  ('hob-postcards', 'Postcards', 'hob-postcards', 'category', 'hobbies', 7, '[]'::jsonb),
  ('hob-music', 'Musical instruments & gear', 'hob-music', 'category', 'hobbies', 8, '[]'::jsonb),
  ('hob-arts', 'Arts & crafts', 'hob-arts', 'category', 'hobbies', 9, '[]'::jsonb),
  ('hob-storage', 'Collectables storage', 'hob-storage', 'category', 'hobbies', 10, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Categories: Sports subcategories ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('spt-cycling', 'Cycling', 'spt-cycling', 'category', 'sports', 0, '[]'::jsonb),
  ('spt-fitness', 'Fitness, running & yoga', 'spt-fitness', 'category', 'sports', 1, '[]'::jsonb),
  ('spt-outdoor', 'Outdoor sports', 'spt-outdoor', 'category', 'sports', 2, '[]'::jsonb),
  ('spt-water', 'Water sports', 'spt-water', 'category', 'sports', 3, '[]'::jsonb),
  ('spt-team', 'Team sports', 'spt-team', 'category', 'sports', 4, '[]'::jsonb),
  ('spt-racquet', 'Racquet sports', 'spt-racquet', 'category', 'sports', 5, '[]'::jsonb),
  ('spt-golf', 'Golf', 'spt-golf', 'category', 'sports', 6, '[]'::jsonb),
  ('spt-equestrian', 'Equestrian', 'spt-equestrian', 'category', 'sports', 7, '[]'::jsonb),
  ('spt-skate', 'Skateboards & scooters', 'spt-skate', 'category', 'sports', 8, '[]'::jsonb),
  ('spt-boxing', 'Boxing & martial arts', 'spt-boxing', 'category', 'sports', 9, '[]'::jsonb),
  ('spt-casual', 'Casual sports & games', 'spt-casual', 'category', 'sports', 10, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Conditions ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('condition-new-with-tags', 'New with tags', 'New with tags', 'condition', NULL, 0, '[]'::jsonb),
  ('condition-very-good', 'Very good', 'Very good', 'condition', NULL, 1, '[]'::jsonb),
  ('condition-good', 'Good', 'Good', 'condition', NULL, 2, '[]'::jsonb),
  ('condition-satisfactory', 'Satisfactory', 'Satisfactory', 'condition', NULL, 3, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Sizes ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('size-xxs', 'XXS', 'XXS', 'size', NULL, 0, '[]'::jsonb),
  ('size-xs', 'XS', 'XS', 'size', NULL, 1, '[]'::jsonb),
  ('size-s', 'S', 'S', 'size', NULL, 2, '[]'::jsonb),
  ('size-m', 'M', 'M', 'size', NULL, 3, '[]'::jsonb),
  ('size-l', 'L', 'L', 'size', NULL, 4, '[]'::jsonb),
  ('size-xl', 'XL', 'XL', 'size', NULL, 5, '[]'::jsonb),
  ('size-xxl', 'XXL', 'XXL', 'size', NULL, 6, '[]'::jsonb),
  ('size-uk-6', 'UK 6', 'UK 6', 'size', NULL, 7, '[]'::jsonb),
  ('size-uk-8', 'UK 8', 'UK 8', 'size', NULL, 8, '[]'::jsonb),
  ('size-uk-10', 'UK 10', 'UK 10', 'size', NULL, 9, '[]'::jsonb),
  ('size-uk-12', 'UK 12', 'UK 12', 'size', NULL, 10, '[]'::jsonb),
  ('size-one-size', 'One size', 'One size', 'size', NULL, 11, '["One Size"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Brands ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('brand-nike', 'Nike', 'Nike', 'brand', NULL, 0, '[]'::jsonb),
  ('brand-adidas', 'Adidas', 'Adidas', 'brand', NULL, 1, '[]'::jsonb),
  ('brand-zara', 'Zara', 'Zara', 'brand', NULL, 2, '[]'::jsonb),
  ('brand-hm', 'H&M', 'H&M', 'brand', NULL, 3, '["hm"]'::jsonb),
  ('brand-gucci', 'Gucci', 'Gucci', 'brand', NULL, 4, '[]'::jsonb),
  ('brand-prada', 'Prada', 'Prada', 'brand', NULL, 5, '[]'::jsonb),
  ('brand-uniqlo', 'Uniqlo', 'Uniqlo', 'brand', NULL, 6, '[]'::jsonb),
  ('brand-levis', 'Levi''s', 'Levi''s', 'brand', NULL, 7, '["levi", "levis"]'::jsonb),
  ('brand-asos', 'ASOS', 'ASOS', 'brand', NULL, 8, '[]'::jsonb),
  ('brand-puma', 'Puma', 'Puma', 'brand', NULL, 9, '[]'::jsonb),
  ('brand-reebok', 'Reebok', 'Reebok', 'brand', NULL, 10, '[]'::jsonb),
  ('brand-new-balance', 'New Balance', 'New Balance', 'brand', NULL, 11, '[]'::jsonb),
  ('brand-asics', 'Asics', 'Asics', 'brand', NULL, 12, '[]'::jsonb),
  ('brand-louis-vuitton', 'Louis Vuitton', 'Louis Vuitton', 'brand', NULL, 13, '["lv"]'::jsonb),
  ('brand-burberry', 'Burberry', 'Burberry', 'brand', NULL, 14, '[]'::jsonb),
  ('brand-balenciaga', 'Balenciaga', 'Balenciaga', 'brand', NULL, 15, '[]'::jsonb),
  ('brand-givenchy', 'Givenchy', 'Givenchy', 'brand', NULL, 16, '[]'::jsonb),
  ('brand-valentino', 'Valentino', 'Valentino', 'brand', NULL, 17, '[]'::jsonb),
  ('brand-saint-laurent', 'Saint Laurent', 'Saint Laurent', 'brand', NULL, 18, '["ysl"]'::jsonb),
  ('brand-carhartt', 'Carhartt', 'Carhartt', 'brand', NULL, 19, '[]'::jsonb),
  ('brand-patagonia', 'Patagonia', 'Patagonia', 'brand', NULL, 20, '[]'::jsonb),
  ('brand-the-north-face', 'The North Face', 'The North Face', 'brand', NULL, 21, '["north face", "tnf"]'::jsonb),
  ('brand-supreme', 'Supreme', 'Supreme', 'brand', NULL, 22, '[]'::jsonb),
  ('brand-stussy', 'Stussy', 'Stussy', 'brand', NULL, 23, '[]'::jsonb),
  ('brand-palace', 'Palace', 'Palace', 'brand', NULL, 24, '[]'::jsonb),
  ('brand-mango', 'Mango', 'Mango', 'brand', NULL, 25, '[]'::jsonb),
  ('brand-topshop', 'Topshop', 'Topshop', 'brand', NULL, 26, '[]'::jsonb),
  ('brand-wrangler', 'Wrangler', 'Wrangler', 'brand', NULL, 27, '[]'::jsonb),
  ('brand-ralph-lauren', 'Ralph Lauren', 'Ralph Lauren', 'brand', NULL, 28, '[]'::jsonb),
  ('brand-off-white', 'Off-White', 'Off-White', 'brand', NULL, 29, '[]'::jsonb),
  ('brand-stone-island', 'Stone Island', 'Stone Island', 'brand', NULL, 30, '[]'::jsonb),
  ('brand-converse', 'Converse', 'Converse', 'brand', NULL, 31, '[]'::jsonb),
  ('brand-vans', 'Vans', 'Vans', 'brand', NULL, 32, '[]'::jsonb),
  ('brand-chanel', 'Chanel', 'Chanel', 'brand', NULL, 33, '[]'::jsonb),
  ('brand-hermes', 'Hermès', 'Hermès', 'brand', NULL, 34, '[]'::jsonb),
  ('brand-dior', 'Dior', 'Dior', 'brand', NULL, 35, '[]'::jsonb),
  ('brand-bottega-veneta', 'Bottega Veneta', 'Bottega Veneta', 'brand', NULL, 36, '[]'::jsonb),
  ('brand-versace', 'Versace', 'Versace', 'brand', NULL, 37, '[]'::jsonb),
  ('brand-other', 'Other', 'Other', 'brand', NULL, 38, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ── Colours ──
INSERT INTO taxonomy_nodes (id, name, display_key, type, parent_id, sort_order, synonyms) VALUES
  ('colour-black', 'Black', 'black', 'colour', NULL, 0, '[]'::jsonb),
  ('colour-white', 'White', 'white', 'colour', NULL, 1, '[]'::jsonb),
  ('colour-navy', 'Navy', 'navy', 'colour', NULL, 2, '[]'::jsonb),
  ('colour-blue', 'Blue', 'blue', 'colour', NULL, 3, '[]'::jsonb),
  ('colour-red', 'Red', 'red', 'colour', NULL, 4, '[]'::jsonb),
  ('colour-green', 'Green', 'green', 'colour', NULL, 5, '[]'::jsonb),
  ('colour-brown', 'Brown', 'brown', 'colour', NULL, 6, '[]'::jsonb),
  ('colour-beige', 'Beige', 'beige', 'colour', NULL, 7, '[]'::jsonb),
  ('colour-grey', 'Grey', 'grey', 'colour', NULL, 8, '["gray"]'::jsonb),
  ('colour-cream', 'Cream', 'cream', 'colour', NULL, 9, '[]'::jsonb),
  ('colour-olive', 'Olive', 'olive', 'colour', NULL, 10, '[]'::jsonb),
  ('colour-burgundy', 'Burgundy', 'burgundy', 'colour', NULL, 11, '["maroon"]'::jsonb),
  ('colour-pink', 'Pink', 'pink', 'colour', NULL, 12, '[]'::jsonb),
  ('colour-yellow', 'Yellow', 'yellow', 'colour', NULL, 13, '[]'::jsonb),
  ('colour-orange', 'Orange', 'orange', 'colour', NULL, 14, '[]'::jsonb),
  ('colour-purple', 'Purple', 'purple', 'colour', NULL, 15, '[]'::jsonb),
  ('colour-khaki', 'Khaki', 'khaki', 'colour', NULL, 16, '[]'::jsonb),
  ('colour-tan', 'Tan', 'tan', 'colour', NULL, 17, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
