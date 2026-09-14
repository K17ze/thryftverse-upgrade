-- 290_holiday_mode_until_down.sql

ALTER TABLE users
  DROP COLUMN IF EXISTS holiday_mode_until;
