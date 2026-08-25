import type { PoolClient } from 'pg';

export type ErasureRegime = 'gdpr' | 'ccpa';

export async function performUserErasure(
  client: PoolClient,
  userId: string,
  regime: ErasureRegime
): Promise<void> {
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
}
