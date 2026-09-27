-- 321_user_saved_listings_column_types.sql
--
-- Corrective guard for `user_saved_listings` identifier column types.
--
-- Migration 306 creates this table with `text` columns to match
-- `users.id`/`listings.id`, which are text primary keys. An earlier
-- revision of 306 declared them `uuid`; that revision could never be
-- recorded by the migration runner because Postgres refuses to create
-- uuid→text foreign keys, so no applied-database checksum is affected
-- by the in-place correction to 306.
--
-- This migration is a defensive repair for any environment where the
-- table exists with uuid columns (schema drift, manual provisioning):
-- it converts the columns to text and re-establishes the intended
-- foreign keys. When the columns are already text it is a no-op, so
-- fresh installs run it harmlessly after 306.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_saved_listings'
      AND column_name = 'user_id'
      AND data_type = 'uuid'
  ) THEN
    -- Drop any stray constraints/indexes depending on the uuid columns so
    -- the USING-cast conversion cannot conflict with a stale definition.
    ALTER TABLE user_saved_listings
      DROP CONSTRAINT IF EXISTS user_saved_listings_user_id_fkey,
      DROP CONSTRAINT IF EXISTS user_saved_listings_listing_id_fkey;

    ALTER TABLE user_saved_listings
      ALTER COLUMN user_id TYPE text USING user_id::text,
      ALTER COLUMN listing_id TYPE text USING listing_id::text;

    ALTER TABLE user_saved_listings
      ADD CONSTRAINT user_saved_listings_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      ADD CONSTRAINT user_saved_listings_listing_id_fkey
        FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
  END IF;
END $$;
