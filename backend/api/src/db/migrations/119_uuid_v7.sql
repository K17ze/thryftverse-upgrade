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
  uuid_bytes bytea;
  rand_a bytea;
  rand_b bytea;
BEGIN
  unix_ts_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  rand_a := gen_random_bytes(2);
  rand_b := gen_random_bytes(8);

  uuid_bytes :=
    set_byte(
      set_byte(
        set_byte(
          set_byte(
            set_byte(
              set_byte(
                decode(lpad(to_hex(unix_ts_ms), 12, '0'), 'hex')
                || set_byte(rand_a, 0, (get_byte(rand_a, 0) & x'0f'::int) | x'70'::int)
                || set_byte(rand_b, 0, (get_byte(rand_b, 0) & x'3f'::int) | x'80'::int)
                || substring(rand_b from 2),
              5, (unix_ts_ms & x'ff'::bigint)::int
            ),
            4, ((unix_ts_ms >> 8) & x'ff'::bigint)::int
          ),
          3, ((unix_ts_ms >> 16) & x'ff'::bigint)::int
        ),
        2, ((unix_ts_ms >> 24) & x'ff'::bigint)::int
      ),
      1, ((unix_ts_ms >> 32) & x'ff'::bigint)::int
    );

  RETURN encode(uuid_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION uuid_v7() IS
  'Generate a time-ordered UUID v7 (RFC 9562) from the current timestamp and crypto-random bytes. Suitable as a DEFAULT for primary keys on new tables.';
