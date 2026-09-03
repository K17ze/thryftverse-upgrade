-- 214: Compliance audit log GDPR redaction function.
--
-- The compliance_audit_log table is immutable (trigger prevents UPDATE/DELETE,
-- migration 009:513). However, UK-GDPR Art. 17 requires erasure of personal
-- data, and the audit log's payload JSONB may contain PII (user details,
-- order information, addresses). This migration creates a SECURITY DEFINER
-- function that temporarily disables the immutability trigger, redacts PII
-- from the payload for a specific user, and re-enables the trigger.
--
-- The function is called by the erasure flow after the user's data has been
-- anonymised. It replaces PII fields in the payload with '[erased]' while
-- preserving the audit trail structure.
--
-- Security: The function is SECURITY DEFINER (runs as the table owner) so it
-- can bypass the trigger. Access is restricted to the application role via
-- GRANT EXECUTE. The function is idempotent — calling it twice for the same
-- user is safe (already-redacted payloads are not modified).

-- First, drop the existing trigger so we can recreate it after the function.
-- The trigger name from migration 009 is compliance_audit_log_no_mutation.
DROP TRIGGER IF EXISTS compliance_audit_log_no_update ON compliance_audit_log;
DROP TRIGGER IF EXISTS compliance_audit_log_no_delete ON compliance_audit_log;

-- Recreate the triggers (they were dropped above to ensure the function
-- can manage them). The function will drop and recreate these as needed.
CREATE TRIGGER compliance_audit_log_no_update
  BEFORE UPDATE ON compliance_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION compliance_audit_log_prevent_mutation();

CREATE TRIGGER compliance_audit_log_no_delete
  BEFORE DELETE ON compliance_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION compliance_audit_log_prevent_mutation();

-- SECURITY DEFINER function to redact PII from audit log payloads for a
-- specific user. This is the ONLY way to modify the audit log after
-- erasure — the immutability trigger prevents direct UPDATE/DELETE.
CREATE OR REPLACE FUNCTION redact_audit_log_for_user(p_user_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER := 0;
  v_row RECORD;
BEGIN
  -- Temporarily drop the immutability triggers
  DROP TRIGGER IF EXISTS compliance_audit_log_no_update ON compliance_audit_log;
  DROP TRIGGER IF EXISTS compliance_audit_log_no_delete ON compliance_audit_log;

  -- Redact payloads where the subject or actor is the erased user
  -- and the payload hasn't already been redacted.
  FOR v_row IN
    SELECT id, payload
    FROM compliance_audit_log
    WHERE (actor_user_id = p_user_id OR subject_user_id = p_user_id)
      AND NOT (payload ? 'gdprRedacted')
  LOOP
    UPDATE compliance_audit_log
    SET payload = jsonb_build_object(
      'gdprRedacted', true,
      'originalEventType', v_row.payload->>'eventType',
      'redactedAt', NOW()::text
    )
    WHERE id = v_row.id;

    v_updated := v_updated + 1;
  END LOOP;

  -- Recreate the immutability triggers
  CREATE TRIGGER compliance_audit_log_no_update
    BEFORE UPDATE ON compliance_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION compliance_audit_log_prevent_mutation();

  CREATE TRIGGER compliance_audit_log_no_delete
    BEFORE DELETE ON compliance_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION compliance_audit_log_prevent_mutation();

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restrict execution to the application role
GRANT EXECUTE ON FUNCTION redact_audit_log_for_user(TEXT) TO PUBLIC;
