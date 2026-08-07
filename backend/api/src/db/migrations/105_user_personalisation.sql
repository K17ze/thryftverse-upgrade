-- 104_user_personalisation.sql
-- Personalisation preferences persisted on the user row.
-- Backs PATCH /users/me/personalisation for feed discovery preferences.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS personalisation_gender_filter TEXT[] NOT NULL DEFAULT ARRAY['Women', 'Men'],
  ADD COLUMN IF NOT EXISTS personalisation_categories_pref TEXT NOT NULL DEFAULT 'Balanced',
  ADD COLUMN IF NOT EXISTS personalisation_brands_pref TEXT NOT NULL DEFAULT 'Any',
  ADD COLUMN IF NOT EXISTS personalisation_members_pref TEXT NOT NULL DEFAULT 'Everyone';
