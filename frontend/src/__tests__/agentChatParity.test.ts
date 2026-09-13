import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

function readBackend(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', '..', '..', 'backend', 'api', 'src', filePath), 'utf-8');
}

/**
 * Agentic-chat capability regression guard.
 *
 * History: a flagship wave deleted the "Chat with AI assistant" entry point
 * from NewMessageScreen, reasoning that no direct-agent-DM backend existed.
 * The real contract — solo group conversation + bot deploy + enqueueAgentRun
 * on every message — already existed end to end. This test pins the restored
 * wiring so the capability can never be silently stripped again, and pins
 * the backend run worker's trigger-body resolution (the bug that made every
 * agent run "succeed" while posting no reply).
 */
describe('AGENTIC CHAT — capability preservation', () => {
  const newMessageSrc = readSrc('screens/NewMessageScreen.tsx');
  const pickerSrc = readSrc('components/chat/ChatAgentPicker.tsx');
  const chatApiSrc = readSrc('services/chatApi.ts');
  const botRuntimeSrc = readBackend('botRuntime/index.ts');
  const chatRoutesSrc = readBackend('routes/chat.ts');

  describe('NewMessageScreen — real agent-chat entry point', () => {
    it('keeps the "Chat with AI assistant" quick action', () => {
      expect(newMessageSrc).toContain('Chat with AI assistant');
      expect(newMessageSrc).toContain('setAgentPickerVisible');
    });

    it('renders ChatAgentPicker wired to a real deploy handler', () => {
      expect(newMessageSrc).toContain('ChatAgentPicker');
      expect(newMessageSrc).toContain('handleStartAgentChat');
    });

    it('creates a real conversation and deploys the real bot id', () => {
      expect(newMessageSrc).toContain('createGroupConversationOnApi');
      expect(newMessageSrc).toContain('deployBotToConversationOnApi');
      expect(newMessageSrc).toContain('deployBotToConversationOnApi(convo.id, agent.id)');
    });

    it('never fabricates demo conversation ids or seeded messages', () => {
      expect(newMessageSrc).not.toContain('agent_dm_');
      expect(newMessageSrc).not.toContain('isDemo: true');
      expect(newMessageSrc).not.toContain('deployAgent(');
      expect(newMessageSrc).not.toContain('getAvailableAgents');
    });

    it('navigates into the real GroupChat surface after deploy', () => {
      expect(newMessageSrc).toContain("navigation.navigate('GroupChat'");
    });
  });

  describe('ChatAgentPicker — real backend catalogue', () => {
    it('loads system and custom bots from the API, not a demo registry', () => {
      expect(pickerSrc).toContain('fetchSystemBotsFromApi');
      expect(pickerSrc).toContain('fetchCustomBotsFromApi');
      expect(pickerSrc).not.toContain('MOCK_AGENTS');
    });

    it('maps the real bot id through to the deploy callback', () => {
      expect(pickerSrc).toContain('id: bot.id');
    });
  });

  describe('Backend — conversation bot contract', () => {
    it('exposes the deploy route used by the entry point', () => {
      expect(chatApiSrc).toContain('deployBotToConversationOnApi');
      expect(chatRoutesSrc).toContain('/bots/:botId/deploy');
    });

    it('enqueues an agent run on every group message', () => {
      expect(chatRoutesSrc).toContain('enqueueAgentRun');
      expect(botRuntimeSrc).toContain('matchAgentInvocation');
    });

    it('processAgentRun resolves the trigger message body (not the "[encrypted]" placeholder)', () => {
      // Regression: the worker previously ran executeBotCommand with
      // messageText: '' so no command ever matched and every run silently
      // "succeeded" with result_message_id null. The trigger body must be
      // loaded and decrypted before invocation matching.
      const processRun = botRuntimeSrc.slice(
        botRuntimeSrc.indexOf('export async function processAgentRun'),
      );
      expect(processRun).toContain('trigger_message_id');
      expect(processRun).toContain('resolveMessageBody');
      expect(processRun).not.toContain("messageText: ''");
      expect(processRun).toContain('messageText: triggerBody');
    });
  });
});
