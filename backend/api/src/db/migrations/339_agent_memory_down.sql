-- Rollback for 339_agent_memory.sql

DROP TABLE IF EXISTS agent_memories;
DROP TABLE IF EXISTS agent_memory_settings;

DELETE FROM agent_tools
WHERE name IN (
  'get_my_listings', 'get_my_orders',
  'recall_memories', 'store_memory', 'forget_memory'
);

ALTER TABLE chat_bot_audit_events
  DROP CONSTRAINT IF EXISTS chat_bot_audit_events_event_type_check;
ALTER TABLE chat_bot_audit_events
  ADD CONSTRAINT chat_bot_audit_events_event_type_check
  CHECK (event_type IN (
    'created', 'updated', 'deleted', 'deployed', 'removed', 'disabled',
    'command_attempted', 'execution_succeeded', 'execution_failed',
    'published', 'rolled_back', 'archived',
    'connection_created', 'connection_verified', 'connection_revoked', 'connection_deleted',
    'run_queued', 'run_started', 'run_succeeded', 'run_failed', 'run_cancelled',
    'tool_called', 'tool_approved', 'tool_rejected', 'tool_denied'
  ));
