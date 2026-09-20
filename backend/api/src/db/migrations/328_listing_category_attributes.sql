-- 326: listings.attributes — structured per-category item specifics.
--
-- The PDP attribute rows were previously a fixed list derived from the
-- flat columns (category/brand/size/condition); there was nowhere to store
-- category-specific facts like a bag's hardware condition, a shoe's box
-- disclosure or a device's functional condition (audit R30/R31).
--
-- The column is a free-form JSONB map of scalar values — the authoritative
-- key space and per-category value constraints live in the application
-- registry (src/lib/categoryAttributes.ts), which is the same pattern the
-- write path already uses for taxonomy values (lenient columns, canonical
-- values enforced in code). No CHECK constraint: attribute keys evolve
-- with the registry and old keys must remain readable.
--
-- DEFAULT '{}' rather than NULL so readers can treat "no authored
-- attributes" uniformly; the registry treats an empty map and NULL
-- identically either way.
--
-- Idempotent: IF NOT EXISTS.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
