import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export type ErasureRegime = 'gdpr' | 'ccpa';

/**
 * Data classes that need post-erasure search index cleanup.
 * The caller (erasure endpoint) reads this list and removes the user's
 * listings from the search index after the transaction commits.
 */
export interface ErasureSideEffects {
  listingIds: string[];
}

export async function performUserErasure(
  client: PoolClient,
  userId: string,
  regime: ErasureRegime
): Promise<ErasureSideEffects> {
  const anonymizedUsername = `deleted_user_${Date.now()}`;

  await client.query(
    `
      UPDATE users
      SET
        username = $2,
        email = NULL,
        password_hash = NULL,
        email_verified_at = NULL,
        last_login_at = NULL,
        two_factor_enabled = FALSE,
        is_erased = TRUE,
        erased_at = NOW(),
        deleted_at = NOW(),
        password_changed_at = NOW(),
        role = 'user',
        ccpa_deletion_requested_at = CASE WHEN $3 = 'ccpa' THEN NOW() ELSE ccpa_deletion_requested_at END
      WHERE id = $1
    `,
    [userId, anonymizedUsername, regime]
  );

  await client.query('DELETE FROM user_addresses WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM user_payment_methods WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM user_secure_profiles WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM wallet_secure_snapshots WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM secure_messages WHERE sender_id = $1 OR recipient_id = $1', [userId]);
  await client.query('DELETE FROM interactions WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM recommendations WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM recommendation_feedback WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM notification_devices WHERE user_id = $1', [userId]);

  await client.query(
    `
      UPDATE notification_events
      SET
        title = '[erased]',
        body = '[erased]',
        payload = '{}'::jsonb,
        metadata = metadata || '{"gdprErased": true}'::jsonb
      WHERE user_id = $1
    `,
    [userId]
  );

  await client.query('DELETE FROM user_totp_factors WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM user_recovery_codes WHERE user_id = $1', [userId]);
  await client.query('UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1', [userId]);
  await client.query('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

  await client.query(
    `
      UPDATE user_compliance_profiles
      SET
        legal_name = NULL,
        date_of_birth = NULL,
        kyc_status = 'expired',
        document_status = 'unsubmitted',
        liveness_status = 'unsubmitted',
        sanctions_status = 'unknown',
        pep_status = 'unknown',
        trading_enabled = FALSE,
        metadata = metadata || '{"gdprErased": true}'::jsonb,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE chat_messages
      SET
        body = '[erased]',
        deleted_for_everyone_at = NOW(),
        metadata = '{}'::jsonb
      WHERE sender_user_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE chat_conversations
      SET
        title = NULL,
        metadata = '{}'::jsonb
      WHERE owner_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      DELETE FROM chat_message_attachments
      WHERE message_id IN (SELECT id FROM chat_messages WHERE sender_user_id = $1)
    `,
    [userId]
  );

  // Delete the user's chat reactions and read receipts — these are
  // attributable to the user via user_id and are not cascaded because
  // the user row is not hard-deleted.
  await client.query('DELETE FROM chat_message_reactions WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM chat_message_read_receipts WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM chat_message_deletions WHERE user_id = $1', [userId]);

  await client.query(
    `
      UPDATE support_conversations
      SET
        title = NULL
      WHERE user_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE support_messages
      SET
        body = '[erased]',
        citations = '[]'::jsonb,
        metadata = '{}'::jsonb
      WHERE author_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      DELETE FROM support_message_attachments
      WHERE message_id IN (SELECT id FROM support_messages WHERE author_id = $1)
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE support_agent_runs
      SET
        tool_calls = '[]'::jsonb,
        tool_results = '[]'::jsonb,
        validator_outcomes = '[]'::jsonb
      WHERE conversation_id IN (SELECT id FROM support_conversations WHERE user_id = $1)
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE support_cases
      SET
        requested_outcome = NULL,
        operational_state = 'closed',
        risk_flags = '[]'::jsonb,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId]
  );

  // Anonymise support case events — the payload JSONB may contain PII
  // (order details, addresses discussed in support). Cascades from
  // support_cases won't fire because we don't hard-delete cases.
  await client.query(
    `
      UPDATE support_case_events
      SET payload = '{"gdprErased": true}'::jsonb
      WHERE case_id IN (SELECT id FROM support_cases WHERE user_id = $1)
    `,
    [userId]
  );

  // Anonymise support handoffs — the handoff_bundle JSONB may contain PII.
  await client.query(
    `
      UPDATE support_handoffs
      SET handoff_bundle = '{"gdprErased": true}'::jsonb
      WHERE conversation_id IN (SELECT id FROM support_conversations WHERE user_id = $1)
    `,
    [userId]
  );

  // Delete support feedback — attributable to the user via user_id.
  await client.query(
    `
      DELETE FROM support_feedback
      WHERE user_id = $1
    `,
    [userId]
  );

  await client.query('DELETE FROM ai_usage_events WHERE user_id = $1', [userId]);

  await client.query(
    `
      UPDATE listings
      SET
        status = 'deleted',
        title = '[erased]',
        description = '[erased]',
        image_url = NULL,
        updated_at = NOW()
      WHERE seller_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE media_assets
      SET
        status = 'deleted',
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE owner_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE orders
      SET
        address_id = NULL,
        payment_method_id = NULL
      WHERE buyer_id = $1 OR seller_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE auction_bids
      SET idempotency_key = NULL
      WHERE bidder_id = $1
    `,
    [userId]
  );

  // Anonymise co-own orders — PII fields (payment method ref, address ref)
  // are nullified. The financial skeleton (asset_id, units, price, status)
  // is retained for the financial-record exemption (Art. 17(3)(b)).
  await client.query(
    `
      UPDATE coOwn_orders
      SET payment_method_id = NULL
      WHERE user_id = $1
    `,
    [userId]
  );

  // Co-own holdings are retained for trading history integrity (the asset
  // registry must reflect accurate ownership history). The user_id is
  // pseudonymised by the user row anonymisation above (username becomes
  // deleted_user_TIMESTAMP). No further action needed on holdings.

  // ── Additional PII tables not covered by CASCADE (user row is anonymised,
  //    not hard-deleted, so ON DELETE CASCADE does not fire) ──

  // Voice messages — contain voice recordings (biometric PII).
  await client.query(
    `DELETE FROM voice_messages WHERE sender_user_id = $1`,
    [userId]
  );

  // User intent ledger — browsing/search behaviour (behavioural PII).
  await client.query(
    `DELETE FROM user_intent_versions WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `DELETE FROM user_intent_mutations WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `DELETE FROM recommendation_topic_projection WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `DELETE FROM recommendation_signal_ledger WHERE user_id = $1`,
    [userId]
  );

  // Moodboard collaboration — user-generated content.
  await client.query(
    `DELETE FROM moodboard_collaborators WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `UPDATE moodboard_invites SET recipient_user_id = NULL WHERE recipient_user_id = $1`,
    [userId]
  );

  // Creator collaborators — user-attributable.
  await client.query(
    `DELETE FROM creator_collaborators WHERE user_id = $1`,
    [userId]
  );
  await client.query(
    `UPDATE creator_collaborators SET target_user_id = NULL WHERE target_user_id = $1`,
    [userId]
  );

  // Seller trust table — trust scores and flags.
  await client.query(
    `DELETE FROM seller_trust WHERE user_id = $1`,
    [userId]
  );

  // Sustainability preferences — user-attributable preferences.
  await client.query(
    `DELETE FROM sustainability_preferences WHERE user_id = $1`,
    [userId]
  );

  // Co-own reservation idempotency — transaction-attributable.
  await client.query(
    `DELETE FROM coown_reservation_idempotency WHERE user_id = $1`,
    [userId]
  );

  // Chat message reports — reporter is attributable.
  await client.query(
    `DELETE FROM chat_message_reports WHERE reporter_user_id = $1`,
    [userId]
  );

  // Record the erasure in the backup deletion manifest so that the backup
  // expiry worker can ensure all backup snapshots containing this user's
  // data are expired within 90 days (UK-GDPR Art. 17 erasure propagation
  // to backups).
  await client.query(
    `
      INSERT INTO backup_deletion_manifest (
        id, user_id, erasure_regime, erased_at, purge_deadline
      ) VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '90 days')
      ON CONFLICT (user_id) DO UPDATE
        SET erased_at = NOW(),
            purge_deadline = NOW() + INTERVAL '90 days',
            purged_at = NULL,
            purge_verification = NULL
    `,
    [randomUUID(), userId, regime]
  );

  // Collect the user's listing IDs for post-commit search index cleanup.
  const listingIdsResult = await client.query<{ id: string }>(
    `SELECT id FROM listings WHERE seller_id = $1`,
    [userId]
  );

  return { listingIds: listingIdsResult.rows.map((r) => r.id) };
}
