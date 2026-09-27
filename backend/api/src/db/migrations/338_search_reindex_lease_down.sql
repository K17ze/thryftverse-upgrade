-- Rollback for 338_search_reindex_lease.
-- Dropping the table also drops any in-flight lease row; a concurrent reindex
-- would then fail its next heartbeat and abort before swapping rather than
-- run unprotected.
DROP TABLE IF EXISTS search_reindex_lease;
