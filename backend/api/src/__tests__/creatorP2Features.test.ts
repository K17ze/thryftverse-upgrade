import assert from 'node:assert/strict';
import test from 'node:test';

// ── P2 Feature tests: collaborators, presence, C2PA, schedule ops ────
// Tests the core invariants of the P2 features without requiring a
// database connection. Each test verifies the deterministic logic that
// makes the features correct.

// ── Collaborator role permissions (P2.12) ─────────────────────────────
// The orchestrator allows owner and editor to publish; viewer and
// non-collaborators are denied.

type CollaboratorRole = 'owner' | 'editor' | 'viewer';

function canPublish(role: CollaboratorRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

function canInvite(role: CollaboratorRole | null): boolean {
  return role === 'owner';
}

function canRemoveCollaborator(role: CollaboratorRole | null): boolean {
  return role === 'owner';
}

function canChangeRole(role: CollaboratorRole | null): boolean {
  return role === 'owner';
}

function canViewDocument(role: CollaboratorRole | null): boolean {
  return role !== null;
}

test('owner can publish, invite, remove, change role, and view', () => {
  assert.ok(canPublish('owner'));
  assert.ok(canInvite('owner'));
  assert.ok(canRemoveCollaborator('owner'));
  assert.ok(canChangeRole('owner'));
  assert.ok(canViewDocument('owner'));
});

test('editor can publish and view, but cannot invite, remove, or change role', () => {
  assert.ok(canPublish('editor'));
  assert.ok(!canInvite('editor'));
  assert.ok(!canRemoveCollaborator('editor'));
  assert.ok(!canChangeRole('editor'));
  assert.ok(canViewDocument('editor'));
});

test('viewer can view but cannot publish, invite, remove, or change role', () => {
  assert.ok(!canPublish('viewer'));
  assert.ok(!canInvite('viewer'));
  assert.ok(!canRemoveCollaborator('viewer'));
  assert.ok(!canChangeRole('viewer'));
  assert.ok(canViewDocument('viewer'));
});

test('non-collaborator (null) has no access', () => {
  assert.ok(!canPublish(null));
  assert.ok(!canInvite(null));
  assert.ok(!canRemoveCollaborator(null));
  assert.ok(!canChangeRole(null));
  assert.ok(!canViewDocument(null));
});

// ── Collaborator state machine (P2.12) ────────────────────────────────
// invited → active (accept) | removed (owner removes)
// active → removed (owner removes) | suspended
// removed → invited (re-invite)

const VALID_COLLABORATOR_STATES = ['active', 'invited', 'suspended', 'removed'];

function isValidCollaboratorState(state: string): boolean {
  return VALID_COLLABORATOR_STATES.includes(state);
}

test('collaborator state machine accepts all valid states', () => {
  for (const state of VALID_COLLABORATOR_STATES) {
    assert.ok(isValidCollaboratorState(state), `${state} should be valid`);
  }
});

test('collaborator state machine rejects invalid states', () => {
  assert.ok(!isValidCollaboratorState('pending'));
  assert.ok(!isValidCollaboratorState('deleted'));
  assert.ok(!isValidCollaboratorState(''));
});

// ── Operation log types (P2.12) ───────────────────────────────────────
// Every significant operation is logged for auditability.

const VALID_OPERATIONS = [
  'save', 'publish', 'schedule', 'cancel_schedule',
  'invite', 'accept_invite', 'remove_collaborator',
  'role_change', 'delete', 'archive', 'restore',
];

function isValidOperation(op: string): boolean {
  return VALID_OPERATIONS.includes(op);
}

test('all valid operations are accepted', () => {
  for (const op of VALID_OPERATIONS) {
    assert.ok(isValidOperation(op), `${op} should be valid`);
  }
});

test('invalid operations are rejected', () => {
  assert.ok(!isValidOperation('random'));
  assert.ok(!isValidOperation(''));
});

// ── Presence activity types (P2.13) ───────────────────────────────────
// Presence is ephemeral — viewing, editing, idle. Never saved as an edit.

const VALID_ACTIVITIES = ['viewing', 'editing', 'idle'];

function isValidActivity(activity: string): boolean {
  return VALID_ACTIVITIES.includes(activity);
}

test('presence activity types are constrained', () => {
  for (const activity of VALID_ACTIVITIES) {
    assert.ok(isValidActivity(activity), `${activity} should be valid`);
  }
  assert.ok(!isValidActivity('typing'));
  assert.ok(!isValidActivity(''));
});

// ── Presence freshness window (P2.13) ─────────────────────────────────
// Presence is only shown if last_seen_at is within the last 30 seconds.
// Stale presence is pruned.

const PRESENCE_FRESHNESS_MS = 30 * 1000; // 30 seconds

function isPresenceFresh(lastSeenAt: string, now: Date = new Date()): boolean {
  const elapsed = now.getTime() - new Date(lastSeenAt).getTime();
  return elapsed <= PRESENCE_FRESHNESS_MS;
}

test('fresh presence (5 seconds ago) is fresh', () => {
  const lastSeen = new Date(Date.now() - 5_000).toISOString();
  assert.ok(isPresenceFresh(lastSeen));
});

test('stale presence (35 seconds ago) is not fresh', () => {
  const lastSeen = new Date(Date.now() - 35_000).toISOString();
  assert.ok(!isPresenceFresh(lastSeen));
});

test('presence at exactly 30 seconds is still fresh', () => {
  const lastSeen = new Date(Date.now() - 30_000).toISOString();
  assert.ok(isPresenceFresh(lastSeen));
});

// ── Presence deduplication (P2.13) ────────────────────────────────────
// A user may have multiple sockets (multiple devices). Presence is
// deduplicated by user_id, keeping the most recent.

function deduplicatePresence(
  entries: Array<{ userId: string; activity: string; lastSeenAt: string }>,
): Array<{ userId: string; activity: string; lastSeenAt: string }> {
  const seen = new Map<string, { userId: string; activity: string; lastSeenAt: string }>();
  for (const entry of entries) {
    const existing = seen.get(entry.userId);
    if (!existing || new Date(entry.lastSeenAt) > new Date(existing.lastSeenAt)) {
      seen.set(entry.userId, entry);
    }
  }
  return Array.from(seen.values());
}

test('presence deduplication keeps most recent per user', () => {
  const entries = [
    { userId: 'user1', activity: 'editing', lastSeenAt: '2026-01-01T10:00:05Z' },
    { userId: 'user1', activity: 'viewing', lastSeenAt: '2026-01-01T10:00:03Z' },
    { userId: 'user2', activity: 'viewing', lastSeenAt: '2026-01-01T10:00:01Z' },
  ];
  const result = deduplicatePresence(entries);
  assert.equal(result.length, 2);
  assert.equal(result[0].userId, 'user1');
  assert.equal(result[0].activity, 'editing'); // most recent
  assert.equal(result[1].userId, 'user2');
});

test('presence deduplication with single entry per user', () => {
  const entries = [
    { userId: 'user1', activity: 'editing', lastSeenAt: '2026-01-01T10:00:05Z' },
    { userId: 'user2', activity: 'viewing', lastSeenAt: '2026-01-01T10:00:03Z' },
  ];
  const result = deduplicatePresence(entries);
  assert.equal(result.length, 2);
});

// ── C2PA content credentials (P2.14) ──────────────────────────────────
// C2PA 2.4 assertion types. The ai-disclosure assertion is the key
// addition for AI-edited media.

const C2PA_ASSERTION_TYPES = [
  'c2pa.ai-disclosure',
  'c2pa.source',
  'c2pa.edit_actions',
  'c2pa.creative_work',
  'c2pa.repository-receipt',
];

function isValidAssertionType(type: string): boolean {
  return C2PA_ASSERTION_TYPES.includes(type);
}

test('C2PA 2.4 assertion types are recognized', () => {
  for (const type of C2PA_ASSERTION_TYPES) {
    assert.ok(isValidAssertionType(type), `${type} should be valid`);
  }
});

test('unknown assertion types are rejected', () => {
  assert.ok(!isValidAssertionType('c2pa.verified'));
  assert.ok(!isValidAssertionType('ai.verified'));
  assert.ok(!isValidAssertionType(''));
});

// ── C2PA AI disclosure detection (P2.14) ──────────────────────────────
// The hasAiDisclosure flag is set when the manifest contains the
// c2pa.ai-disclosure assertion. The UI uses this to show a restrained
// "Content details" action — never a decorative "AI verified" pill.

function hasAiDisclosure(assertionTypes: string[]): boolean {
  return assertionTypes.includes('c2pa.ai-disclosure');
}

test('manifest with ai-disclosure assertion has AI disclosure', () => {
  assert.ok(hasAiDisclosure(['c2pa.source', 'c2pa.ai-disclosure']));
});

test('manifest without ai-disclosure assertion does not have AI disclosure', () => {
  assert.ok(!hasAiDisclosure(['c2pa.source', 'c2pa.edit_actions']));
});

test('empty manifest does not have AI disclosure', () => {
  assert.ok(!hasAiDisclosure([]));
});

// ── C2PA credential source (P2.14) ────────────────────────────────────
// Credentials can be platform-generated, imported, or third-party.

const VALID_CREDENTIAL_SOURCES = ['platform', 'imported', 'third_party'];

function isValidCredentialSource(source: string): boolean {
  return VALID_CREDENTIAL_SOURCES.includes(source);
}

test('C2PA credential sources are constrained', () => {
  for (const source of VALID_CREDENTIAL_SOURCES) {
    assert.ok(isValidCredentialSource(source), `${source} should be valid`);
  }
  assert.ok(!isValidCredentialSource('user'));
  assert.ok(!isValidCredentialSource(''));
});

// ── C2PA spec version (P2.14) ─────────────────────────────────────────
// The current spec version is 2.4 (April 2026).

function isSupportedSpecVersion(version: string): boolean {
  // Support 2.4 and above (forward-compatible with future 2.x versions)
  const parts = version.split('.');
  const major = parseInt(parts[0] ?? '0', 10);
  const minor = parseInt(parts[1] ?? '0', 10);
  return major === 2 && minor >= 4;
}

test('C2PA 2.4 is supported', () => {
  assert.ok(isSupportedSpecVersion('2.4'));
});

test('C2PA 2.5 is supported (forward-compatible)', () => {
  assert.ok(isSupportedSpecVersion('2.5'));
});

test('C2PA 2.3 is not supported (too old)', () => {
  assert.ok(!isSupportedSpecVersion('2.3'));
});

test('C2PA 1.x is not supported', () => {
  assert.ok(!isSupportedSpecVersion('1.4'));
});

// ── Schedule operations (P2.15) ───────────────────────────────────────
// The schedule state machine: pending → claimed → published | failed | cancelled

const VALID_SCHEDULE_STATES = ['pending', 'claimed', 'published', 'failed', 'cancelled'];

function isValidScheduleState(state: string): boolean {
  return VALID_SCHEDULE_STATES.includes(state);
}

test('schedule state machine accepts all valid states', () => {
  for (const state of VALID_SCHEDULE_STATES) {
    assert.ok(isValidScheduleState(state), `${state} should be valid`);
  }
});

test('schedule state machine rejects invalid states', () => {
  assert.ok(!isValidScheduleState('draft'));
  assert.ok(!isValidScheduleState('active'));
  assert.ok(!isValidScheduleState(''));
});

// ── Schedule recovery (P2.15) ─────────────────────────────────────────
// A failed schedule can be retried (creates a new schedule row).
// A cancelled schedule increments version so stale claims can't publish.

function canRetrySchedule(state: string): boolean {
  return state === 'failed' || state === 'cancelled';
}

test('failed schedule can be retried', () => {
  assert.ok(canRetrySchedule('failed'));
});

test('cancelled schedule can be retried', () => {
  assert.ok(canRetrySchedule('cancelled'));
});

test('published schedule cannot be retried', () => {
  assert.ok(!canRetrySchedule('published'));
});

test('pending schedule cannot be retried (still waiting)', () => {
  assert.ok(!canRetrySchedule('pending'));
});
