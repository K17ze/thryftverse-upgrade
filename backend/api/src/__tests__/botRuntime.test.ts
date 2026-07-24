import assert from 'node:assert/strict';
import test from 'node:test';
import { matchAgentInvocation, matchBotCommand } from '../botRuntime/index.js';
import { DEFAULT_AGENT_CONFIG } from '../botRuntime/agentConfig.js';
import { resolveBotHandler } from '../botRuntime/handlers.js';
import {
  assistantHandler,
  moderationHandler,
  commerceHandler,
  safetyHandler,
  automationHandler,
  stylingHandler,
  customBotHandler,
} from '../botRuntime/handlers.js';
import type { BotRuntimeContext } from '../botRuntime/types.js';

function makeCtx(overrides: Partial<BotRuntimeContext> = {}): BotRuntimeContext {
  return {
    botId: 'bot_1',
    botName: 'TestBot',
    botSlug: 'test-bot',
    botCategory: 'assistant',
    botType: 'system',
    commandHint: '/test',
    conversationId: 'conv_1',
    conversationType: 'group',
    conversationTitle: 'Test Group',
    actorUserId: 'user_1',
    actorUserName: 'Alice',
    permissionsSnapshot: ['read_messages', 'reply_in_chat'],
    command: '/test',
    args: [],
    messageText: '/test',
    agentConfig: null,
    conversationHistory: [],
    runtimeData: {
      listings: [],
      recentMessagesAnalyzed: 0,
      messagesRequiringReview: 0,
    },
    ...overrides,
  };
}

// ── matchBotCommand ─────────────────────────────────────────────────

test('matchBotCommand matches exact command hint', () => {
  const m = matchBotCommand('/deal help', '/deal');
  assert.ok(m);
  assert.equal(m!.command, '/deal');
  assert.deepEqual(m!.args, ['help']);
});

test('matchBotCommand matches command hint with multiple args', () => {
  const m = matchBotCommand('/deal search vintage jacket', '/deal');
  assert.ok(m);
  assert.equal(m!.command, '/deal');
  assert.deepEqual(m!.args, ['search', 'vintage', 'jacket']);
});

test('matchBotCommand rejects unrelated text', () => {
  const m = matchBotCommand('hello world', '/deal');
  assert.equal(m, null);
});

test('matchBotCommand rejects partial match', () => {
  const m = matchBotCommand('deal help', '/deal');
  assert.equal(m, null);
});

test('matchBotCommand handles exact hint with no args', () => {
  const m = matchBotCommand('/deal', '/deal');
  assert.ok(m);
  assert.equal(m!.command, '/deal');
  assert.deepEqual(m!.args, []);
});

test('matchBotCommand is case-insensitive on match but preserves args', () => {
  const m = matchBotCommand('/DEAL Help', '/deal');
  assert.ok(m);
  assert.equal(m!.command, '/deal');
  assert.deepEqual(m!.args, ['Help']);
});

test('matchAgentInvocation matches a configured agent mention', () => {
  const match = matchAgentInvocation('@test-bot compare these options', {
    botName: 'Test Bot',
    botSlug: 'test-bot',
    commandHint: '/test',
    agentConfig: { ...DEFAULT_AGENT_CONFIG, triggerMode: 'mention' },
  });
  assert.ok(match);
  assert.equal(match!.command, '@test-bot');
  assert.deepEqual(match!.args, ['compare', 'these', 'options']);
});

test('matchAgentInvocation keeps mention agents quiet without a mention', () => {
  const match = matchAgentInvocation('compare these options', {
    botName: 'Test Bot',
    botSlug: 'test-bot',
    commandHint: '/test',
    agentConfig: { ...DEFAULT_AGENT_CONFIG, triggerMode: 'mention' },
  });
  assert.equal(match, null);
});

test('matchAgentInvocation allows explicit every-message participation', () => {
  const match = matchAgentInvocation('compare these options', {
    botName: 'Test Bot',
    botSlug: 'test-bot',
    commandHint: '/test',
    agentConfig: { ...DEFAULT_AGENT_CONFIG, triggerMode: 'always' },
  });
  assert.deepEqual(match, { command: 'message', args: [] });
});

// ── resolveBotHandler ───────────────────────────────────────────────

test('resolveBotHandler returns handler for known categories', () => {
  assert.equal(typeof resolveBotHandler('assistant'), 'function');
  assert.equal(typeof resolveBotHandler('moderation'), 'function');
  assert.equal(typeof resolveBotHandler('commerce'), 'function');
  assert.equal(typeof resolveBotHandler('safety'), 'function');
  assert.equal(typeof resolveBotHandler('automation'), 'function');
  assert.equal(typeof resolveBotHandler('styling'), 'function');
  assert.equal(typeof resolveBotHandler('custom'), 'function');
});

test('resolveBotHandler returns null for unknown category', () => {
  assert.equal(resolveBotHandler('unknown'), null);
});

// ── assistantHandler ────────────────────────────────────────────────

test('assistantHandler returns help for empty args', () => {
  const result = assistantHandler(makeCtx());
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /Available commands/);
});

test('assistantHandler returns status for status arg', () => {
  const result = assistantHandler(makeCtx({ args: ['status'] }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /connected/);
});

test('assistantHandler returns generic response for unknown arg', () => {
  const result = assistantHandler(makeCtx({ args: ['unknown'] }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /not recognised/);
});

// ── moderationHandler ───────────────────────────────────────────────

test('moderationHandler returns rules for rules arg', () => {
  const result = moderationHandler(makeCtx({ botCategory: 'moderation' }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /Available commands/);
});

test('moderationHandler returns group rules', () => {
  const result = moderationHandler(makeCtx({ botCategory: 'moderation', args: ['rules'] }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /Group rules/);
});

// ── commerceHandler ─────────────────────────────────────────────────

test('commerceHandler returns search response', () => {
  const result = commerceHandler(makeCtx({
    botCategory: 'commerce',
    args: ['search', 'jacket'],
    runtimeData: {
      listings: [{ id: 'listing_1', title: 'Workwear jacket', priceGbp: 48, brand: 'Carhartt' }],
      recentMessagesAnalyzed: 0,
      messagesRequiringReview: 0,
    },
  }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /Matches for “jacket”/);
  assert.match(result.text, /Workwear jacket/);
});

test('commerceHandler returns unknown command for invalid arg', () => {
  const result = commerceHandler(makeCtx({ botCategory: 'commerce', args: ['invalid'] }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /not recognised/);
});

// ── safetyHandler ───────────────────────────────────────────────────

test('safetyHandler returns check response', () => {
  const result = safetyHandler(makeCtx({
    botCategory: 'safety',
    args: ['check'],
    runtimeData: {
      listings: [],
      recentMessagesAnalyzed: 12,
      messagesRequiringReview: 1,
    },
  }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /Reviewed 12 recent messages/);
  assert.match(result.text, /checked by a moderator/);
});

// ── automationHandler ───────────────────────────────────────────────

test('automationHandler returns status response', () => {
  const result = automationHandler(makeCtx({ botCategory: 'automation', args: ['status'] }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /Connected/);
});

// ── stylingHandler ──────────────────────────────────────────────────

test('stylingHandler returns outfit response', () => {
  const result = stylingHandler(makeCtx({
    botCategory: 'styling',
    args: ['outfit'],
    runtimeData: {
      listings: [{ id: 'listing_1', title: 'Pleated trousers', priceGbp: 32, brand: null }],
      recentMessagesAnalyzed: 0,
      messagesRequiringReview: 0,
    },
  }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /marketplace outfit/);
  assert.match(result.text, /Pleated trousers/);
});

test('stylingHandler returns palette response', () => {
  const result = stylingHandler(makeCtx({ botCategory: 'styling', args: ['palette'] }));
  assert.equal(result.shouldReply, true);
  assert.match(result.text, /require colour data/);
});

// ── customBotHandler ──────────────────────────────────────────────────

test('customBotHandler never publishes its placeholder response', () => {
  const result = customBotHandler(makeCtx({ botCategory: 'custom', botType: 'custom', messageText: '/mybot hello' }));
  assert.equal(result.shouldReply, false);
});
