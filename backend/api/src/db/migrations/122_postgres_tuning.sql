-- PostgreSQL production tuning.
--
-- Sets recommended server parameters for a 1 GB RAM production instance.
-- ALTER SYSTEM writes to postgresql.auto.conf and requires SUPERUSER.
-- Run this migration as the DBA / superuser, not as the application role.
--
-- Idempotent: ALTER SYSTEM SET is safe to run multiple times; it simply
-- overwrites the previously persisted value. A server restart (or
-- `SELECT pg_reload_conf()` for reloadable parameters) is required for
-- changes to take effect.
--
-- Equivalent postgresql.conf snippet (for environments that prefer file
-- based configuration over ALTER SYSTEM):
--
--   shared_buffers = 256MB
--   work_mem = 16MB
--   maintenance_work_mem = 128MB
--   effective_cache_size = 768MB
--   random_page_cost = 1.1
--   log_min_duration_statement = 1000
--   checkpoint_completion_target = 0.9
--   wal_buffers = 16MB
--   max_connections = 200

ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET max_connections = 200;
