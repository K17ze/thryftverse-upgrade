-- 333_wallet_ize_transfers_context_single_use.sql
--
-- assertP2pTransferContextAuthorized (lib/walletMoneyPath.ts) enforces that a
-- privileged transfer context (e.g. a settled coOwn_trade) is single-use by
-- SELECTing for a prior committed transfer carrying the same
-- metadata->>'contextType' / metadata->>'contextId' pair. That check is
-- read-then-act: two concurrent transfers carrying the same context (the
-- claim layer only dedups same-key retries — different keys or none at all
-- bypass it) both pass the SELECT and both commit, crediting the seller
-- twice for one trade. No row lock can close this — the first transfer's
-- row does not exist yet when the second checks.
--
-- This partial unique index makes single-use a database invariant: the
-- losing INSERT waits on the in-flight speculative insert and then fails
-- with 23505 once the winner commits. The route maps that violation to the
-- same P2P_TRANSFER_CONTEXT_BLOCKED error the pre-check raises.
--
-- Partial on (status = 'committed' AND both keys present): context-less
-- transfers carry NULL metadata keys and are exempt, and a 'reversed'
-- transfer releases the context so a corrective re-transfer can reuse it.
--
-- Non-concurrent like 307's partial unique index: the table is small and
-- this runs inside the migration transaction.

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ize_transfers_context_uidx
  ON wallet_ize_transfers (
    (metadata->>'contextType'),
    (metadata->>'contextId')
  )
  WHERE status = 'committed'
    AND metadata->>'contextType' IS NOT NULL
    AND metadata->>'contextId' IS NOT NULL;
