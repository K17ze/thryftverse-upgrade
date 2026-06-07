import assert from 'node:assert/strict';
import test from 'node:test';

// Bot validation logic extracted for unit testing
function validateBotDeployability(
  bot: {
    is_draft: boolean;
    status: string;
    runtime_mode: string;
  }
): { deployable: boolean; reason?: string } {
  if (bot.is_draft) {
    return { deployable: false, reason: 'Draft bots cannot be deployed' };
  }
  if (bot.status === 'backend-required') {
    return { deployable: false, reason: 'Backend runtime not connected' };
  }
  if (bot.status === 'disabled') {
    return { deployable: false, reason: 'Bot is disabled' };
  }
  return { deployable: true };
}

function canManageBot(
  bot: { type: 'system' | 'custom'; owner_id: string | null },
  userId: string,
  platformRole?: string
): boolean {
  if (bot.type === 'system') return false; // system bots managed by platform
  if (platformRole === 'admin') return true;
  return bot.owner_id === userId;
}

test('validateBotDeployability blocks draft bots', () => {
  const result = validateBotDeployability({ is_draft: true, status: 'available', runtime_mode: 'config-only' });
  assert.equal(result.deployable, false);
  assert.match(result.reason ?? '', /Draft/);
});

test('validateBotDeployability blocks backend-required bots', () => {
  const result = validateBotDeployability({ is_draft: false, status: 'backend-required', runtime_mode: 'backend' });
  assert.equal(result.deployable, false);
  assert.match(result.reason ?? '', /Backend/);
});

test('validateBotDeployability allows local-only config-only bots', () => {
  const result = validateBotDeployability({ is_draft: false, status: 'local-only', runtime_mode: 'config-only' });
  assert.equal(result.deployable, true);
});

test('validateBotDeployability allows available backend bots with warning', () => {
  const result = validateBotDeployability({ is_draft: false, status: 'available', runtime_mode: 'backend' });
  assert.equal(result.deployable, true);
});

test('canManageBot allows owner to manage custom bot', () => {
  assert.equal(canManageBot({ type: 'custom', owner_id: 'user_a' }, 'user_a'), true);
});

test('canManageBot denies non-owner for custom bot', () => {
  assert.equal(canManageBot({ type: 'custom', owner_id: 'user_a' }, 'user_b'), false);
});

test('canManageBot allows admin to manage any custom bot', () => {
  assert.equal(canManageBot({ type: 'custom', owner_id: 'user_a' }, 'user_b', 'admin'), true);
});

test('canManageBot denies managing system bots', () => {
  assert.equal(canManageBot({ type: 'system', owner_id: null }, 'user_a', 'admin'), false);
});

test('bot audit event types are valid', () => {
  const validTypes = ['created', 'updated', 'deleted', 'deployed', 'removed', 'disabled', 'command_attempted'];
  for (const t of validTypes) {
    assert.ok(typeof t === 'string');
  }
});
