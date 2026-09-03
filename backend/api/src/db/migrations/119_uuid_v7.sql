-- UUID v7 support (RFC 9562).
--
-- Provides a time-ordered UUID generator for use as DEFAULT on new tables.
-- Time-ordered UUIDs improve B-tree locality and reduce index fragmentation
-- compared to random UUID v4 on append-heavy workloads.
--
-- This migration only creates the function; it does NOT alter existing
-- tables. New tables can use `DEFAULT uuid_v7()` on their primary key.
--
-- Idempotent: CREATE OR REPLACE FUNCTION is safe to run multiple times.

CREATE OR REPLACE FUNCTION uuid_v7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bigint;
  ts_hex text;
  rand_bytes bytea;
  uuid_hex text;
BEGIN
  unix_ts_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  ts_hex := lpad(to_hex(unix_ts_ms), 12, '0');
  rand_bytes := gen_random_bytes(10);

  -- version bit (0x70) and variant bit (0x80)
  rand_bytes := set_byte(rand_bytes, 0, (get_byte(rand_bytes, 0) & 15) | 112);
  rand_bytes := set_byte(rand_bytes, 2, (get_byte(rand_bytes, 2) & 63) | 128);

  uuid_hex := ts_hex || encode(rand_bytes, 'hex');
  RETURN uuid_hex::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION uuid_v7() IS
  'Generate a time-ordered UUID v7 (RFC 9562) from the current timestamp and crypto-random bytes. Suitable as a DEFAULT for primary keys on new tables.';
