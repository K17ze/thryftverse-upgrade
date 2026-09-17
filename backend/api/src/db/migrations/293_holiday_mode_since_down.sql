-- 293_holiday_mode_since_down.sql

ALTER TABLE users
  DROP COLUMN IF EXISTS holiday_mode_since;
