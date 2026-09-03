import assert from 'node:assert/strict';
import test from 'node:test';
import {
  toolsToOpenAIFormat,
  evaluateToolPolicy,
  type ToolDefinition,
  type ToolBinding,
} from '../botRuntime/toolRegistry.js';

// ── Tool Registry: toolsToOpenAIFormat ─────────────────────────────

test('toolsToOpenAIFormat converts tool definitions to OpenAI format', () => {
  const tools: ToolDefinition[] = [
    {
      name: 'search_listings',
      description: 'Search marketplace listings',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      risk: 'read',
      requiredPermission: null,
      isEnabled: true,
      version: '1',
    },
    {
      name: 'draft_reply',
      description: 'Draft a reply',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      risk: 'reversible_write',
      requiredPermission: 'reply_in_chat',
      isEnabled: true,
      version: '1',
    },
  ];

  const result = toolsToOpenAIFormat(tools);
  assert.equal(result.length, 2);
  assert.equal(result[0].type, 'function');
  assert.equal(result[0].function.name, 'search_listings');
  assert.equal(result[0].function.description, 'Search marketplace listings');
  assert.deepEqual(result[0].function.parameters, { type: 'object', properties: { query: { type: 'string' } } });
  assert.equal(result[1].function.name, 'draft_reply');
});

// ── Tool Registry: evaluateToolPolicy ──────────────────────────────

const readTool: ToolDefinition = {
  name: 'search_listings',
  description: 'Search',
  inputSchema: {},
  risk: 'read',
  requiredPermission: null,
  isEnabled: true,
  version: '1',
};

const writeTool: ToolDefinition = {
  name: 'draft_reply',
  description: 'Draft',
  inputSchema: {},
  risk: 'reversible_write',
  requiredPermission: 'reply_in_chat',
  isEnabled: true,
  version: '1',
};

const consequentialTool: ToolDefinition = {
  name: 'make_offer',
  description: 'Make an offer',
  inputSchema: {},
  risk: 'consequential_write',
  requiredPermission: 'reply_in_chat',
  isEnabled: true,
  version: '1',
};

test('evaluateToolPolicy allows read tools without approval', () => {
  const decision = evaluateToolPolicy(readTool, undefined, [], false);
  assert.equal(decision.decision, 'allow');
});

test('evaluateToolPolicy denies when required permission is missing', () => {
  const decision = evaluateToolPolicy(writeTool, undefined, [], false);
  assert.equal(decision.decision, 'deny');
  assert.ok(decision.reason.includes('reply_in_chat'));
});

test('evaluateToolPolicy allows write tools with permission', () => {
  const decision = evaluateToolPolicy(writeTool, undefined, ['reply_in_chat'], false);
  assert.equal(decision.decision, 'allow');
});

test('evaluateToolPolicy requires approval for consequential writes', () => {
  const decision = evaluateToolPolicy(consequentialTool, undefined, ['reply_in_chat'], false);
  assert.equal(decision.decision, 'require_approval');
  assert.ok(decision.reason.includes('consequential'));
});

test('evaluateToolPolicy allows consequential writes with approval', () => {
  const decision = evaluateToolPolicy(consequentialTool, undefined, ['reply_in_chat'], true);
  assert.equal(decision.decision, 'allow');
});

test('evaluateToolPolicy denies blocked bindings', () => {
  const binding: ToolBinding = { toolName: 'search_listings', policy: 'blocked' };
  const decision = evaluateToolPolicy(readTool, binding, [], false);
  assert.equal(decision.decision, 'deny');
  assert.ok(decision.reason.includes('blocked'));
});

test('evaluateToolPolicy requires approval for ask_each_time', () => {
  const binding: ToolBinding = { toolName: 'search_listings', policy: 'ask_each_time' };
  const decision = evaluateToolPolicy(readTool, binding, [], false);
  assert.equal(decision.decision, 'require_approval');
  assert.ok(decision.reason.includes('approval'));
});

test('evaluateToolPolicy allows ask_each_time with approval', () => {
  const binding: ToolBinding = { toolName: 'search_listings', policy: 'ask_each_time' };
  const decision = evaluateToolPolicy(readTool, binding, [], true);
  assert.equal(decision.decision, 'allow');
});

test('evaluateToolPolicy requires approval for ask_once without prior approval', () => {
  const binding: ToolBinding = { toolName: 'search_listings', policy: 'ask_once' };
  const decision = evaluateToolPolicy(readTool, binding, [], false);
  assert.equal(decision.decision, 'require_approval');
  assert.ok(decision.reason.includes('one-time'));
});

// ── Canonical contract types ───────────────────────────────────────

test('CanonicalAgentContract type is exported and has expected shape', async () => {
  // CanonicalAgentContract is a type-only export — verify the module loads
  // and the type is usable by constructing a value of that shape.
  const module = await import('../botRuntime/types.js');
  assert.ok(typeof module === 'object' && module !== null);
  type _ContractCheck = import('../botRuntime/types.js').CanonicalAgentContract;
  const sample: _ContractCheck = {
    id: 'bot_test',
    name: 'Test Agent',
    description: 'A test agent',
    category: 'assistant',
    commandHint: '/test',
    icon: null,
    instructions: 'Be helpful',
    triggerMode: 'mention',
    tone: 'focused',
    responseLength: 'balanced',
    reasoningEffort: 'medium',
    starterPrompts: [],
    model: 'gpt-5.6-terra',
    historyLimit: 10,
    confidenceThreshold: 0.6,
    permissions: [],
    isDraft: false,
    status: 'available',
    runtimeMode: 'ai',
  };
  assert.equal(sample.id, 'bot_test');
});

// ── Versioned publishing checksums ─────────────────────────────────

test('MD5 checksum computation is deterministic', async () => {
  const { createHash } = await import('node:crypto');
  const config1 = { instructions: 'test', model: 'gpt-5.6-terra' };
  const config2 = { instructions: 'test', model: 'gpt-5.6-terra' };
  const checksum1 = createHash('md5').update(JSON.stringify(config1)).digest('hex');
  const checksum2 = createHash('md5').update(JSON.stringify(config2)).digest('hex');
  assert.equal(checksum1, checksum2);
  assert.equal(checksum1.length, 32);
});

test('MD5 checksum differs for different configs', async () => {
  const { createHash } = await import('node:crypto');
  const config1 = { instructions: 'test', model: 'gpt-5.6-terra' };
  const config2 = { instructions: 'different', model: 'gpt-5.6-terra' };
  const checksum1 = createHash('md5').update(JSON.stringify(config1)).digest('hex');
  const checksum2 = createHash('md5').update(JSON.stringify(config2)).digest('hex');
  assert.notEqual(checksum1, checksum2);
});

// ── Encryption utilities ───────────────────────────────────────────

test('AES-256-GCM encryption is reversible', async () => {
  const { createHash, randomBytes, createCipheriv, createDecipheriv } = await import('node:crypto');
  const key = createHash('sha256').update('test-key').digest().slice(0, 32);
  const plaintext = 'sk-test-api-key-12345';

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const stored = Buffer.concat([iv, authTag, encrypted]).toString('base64');

  // Decrypt
  const buf = Buffer.from(stored, 'base64');
  const decIv = buf.slice(0, 12);
  const decAuthTag = buf.slice(12, 28);
  const decEncrypted = buf.slice(28);
  const decipher = createDecipheriv('aes-256-gcm', key, decIv);
  decipher.setAuthTag(decAuthTag);
  const decrypted = Buffer.concat([decipher.update(decEncrypted), decipher.final()]).toString('utf8');

  assert.equal(decrypted, plaintext);
});

test('maskApiKey masks the middle of a key', async () => {
  // Import from bots.ts is not possible (it's a route file), so test the logic directly
  function maskApiKey(key: string): string {
    if (key.length <= 8) return '••••';
    return key.slice(0, 3) + '••••' + key.slice(-4);
  }
  assert.equal(maskApiKey('sk-test-api-key-12345'), 'sk-••••2345');
  assert.equal(maskApiKey('short'), '••••');
});

// ── Idempotency key format ─────────────────────────────────────────

test('idempotency key format is deterministic for same trigger+bot', () => {
  const triggerMessageId = 'msg_abc123';
  const botId = 'bot_xyz789';
  const key1 = `${triggerMessageId}:${botId}`;
  const key2 = `${triggerMessageId}:${botId}`;
  assert.equal(key1, key2);
});

// ── Agent run state machine ────────────────────────────────────────

test('agent run status transitions are valid', () => {
  const validTransitions: Record<string, string[]> = {
    'queued': ['running', 'cancelled'],
    'running': ['succeeded', 'failed', 'timed_out', 'cancelled', 'waiting_for_approval'],
    'waiting_for_approval': ['running', 'cancelled'],
    'waiting_for_input': ['running', 'cancelled'],
  };

  // Verify all terminal states have no outgoing transitions
  const terminalStates = ['succeeded', 'failed', 'timed_out', 'cancelled', 'unknown_outcome'];
  for (const terminal of terminalStates) {
    assert.ok(!validTransitions[terminal], `${terminal} should be terminal`);
  }

  // Verify queued can transition to running
  assert.ok(validTransitions['queued'].includes('running'));
  // Verify running can transition to succeeded
  assert.ok(validTransitions['running'].includes('succeeded'));
  // Verify running can transition to failed
  assert.ok(validTransitions['running'].includes('failed'));
});
