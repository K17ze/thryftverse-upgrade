'use client';

/**
 * useConversationAgents — the group agent-management data path, ported
 * from mobile GroupBotManagementScreen (useChatAgents + deployments).
 *
 * Live mode reads GET /chat/bots + GET /chat/conversations/:id/bots and
 * writes POST .../bots/:botId/deploy / DELETE .../bots/:botId — the same
 * edges mobile calls. Fixture mode reads the module catalog and deploys
 * through deployFixtureConversationAgent, which also posts the system
 * message into the thread (mobile store parity), so the change is
 * visible in-chat on the same write.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as agentService from '@/lib/api/services/conversationAgents';
import {
  CONVERSATION_AGENTS,
  CONVERSATION_AGENT_DEPLOYMENTS,
  deployFixtureConversationAgent,
  undeployFixtureConversationAgent,
} from '@/lib/data/fixtures-conversationAgents';
import type {
  ConversationAgent,
  ConversationBotDeployment,
} from '@/lib/contracts/conversationAgents';
import { useSession } from '@/lib/session/SessionProvider';

export interface ConversationAgentsData {
  agents: ConversationAgent[];
  deployments: ConversationBotDeployment[];
}

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

export function useConversationAgents(
  conversationId: string | undefined,
  enabled: boolean,
) {
  const qc = useQueryClient();
  const { user } = useSession();
  const key = ['conversation-agents', conversationId ?? ''];

  const query = useQuery<ConversationAgentsData>({
    queryKey: key,
    enabled: enabled && !!conversationId,
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const [agents, deployments] = await Promise.all([
          agentService.fetchChatAgents(),
          agentService.fetchConversationAgentDeployments(conversationId!),
        ]);
        return { agents, deployments };
      }
      await tick();
      return {
        agents: CONVERSATION_AGENTS,
        deployments: [
          ...(CONVERSATION_AGENT_DEPLOYMENTS[conversationId!] ?? []),
        ],
      };
    },
  });

  const invalidateThread = () => {
    void qc.invalidateQueries({ queryKey: key });
    // Deploy/undeploy post a system message into the thread — the
    // conversation and inbox caches re-read so the stream and the row
    // preview show it on the same write.
    void qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };

  /** True on success — the caller toasts; false means the edge/store
   *  refused and nothing was applied. */
  const deploy = async (botId: string): Promise<boolean> => {
    if (!conversationId) return false;
    try {
      if (DATA_MODE === 'live') {
        await agentService.deployConversationAgent(conversationId, botId);
      } else if (
        !deployFixtureConversationAgent(conversationId, botId, user?.id ?? 'me')
      ) {
        return false;
      }
    } catch {
      return false;
    }
    invalidateThread();
    return true;
  };

  const undeploy = async (botId: string): Promise<boolean> => {
    if (!conversationId) return false;
    try {
      if (DATA_MODE === 'live') {
        await agentService.undeployConversationAgent(conversationId, botId);
      } else if (!undeployFixtureConversationAgent(conversationId, botId)) {
        return false;
      }
    } catch {
      return false;
    }
    invalidateThread();
    return true;
  };

  return { ...query, deploy, undeploy };
}
