/**
 * useConversationAgents — agent deployment, agent draft vs sent, working/tool/
 * approval states.
 *
 * Owns:
 * - Deployed chat agents list (demo-mode service)
 * - Agent picker visibility
 * - Agent suggested replies
 * - Deploy/remove/suggest handlers
 * - Agent quick replies from connected custom bots
 *
 * Per spec 16:
 * - Agent invocation: @agent, plus menu → Ask agent, long press message →
 *   Ask agent about this, group info → Add agent.
 * - When agents attached, a single quiet `2 agents` indicator is enough.
 * - Working state: `Archive Stylist is working…` [Stop]; Tool call:
 *   `Searching Saved items…`; Approval card appears inline; NO fake typing
 *   dots for multi-step tool work.
 * - Agent-generated draft lives in draft/composer surface, enters message
 *   history only after configured send policy satisfied.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useStore } from "../../store/useStore";
import {
  type ChatAgent,
  type SuggestedReply,
} from "../../services/chatAgentsApi";
import { fetchConversationDeploymentsFromApi } from "../../services/botsApi";
import {
  deployBotToConversationOnApi,
  undeployBotFromConversationOnApi,
} from "../../services/chatApi";
import type { ConversationBotDeployment } from "../../domain/chat";

const EMPTY_DEPLOYMENTS: ConversationBotDeployment[] = [];

interface UseConversationAgentsOptions {
  conversationId: string | undefined;
  show: (msg: string, type: "success" | "error" | "info") => void;
  haptic: { success: () => void; medium: () => void; selection: () => void };
  setInput: (v: string) => void;
}

export function useConversationAgents({
  conversationId,
  show,
  haptic,
  setInput,
}: UseConversationAgentsOptions) {
  const [chatAgentPickerVisible, setChatAgentPickerVisible] = useState(false);
  const [chatAgentSuggestions, setChatAgentSuggestions] = useState<SuggestedReply[]>([]);

  const customBots = useStore((state) => state.customBots);
  const deployments = useStore((state) =>
    conversationId
      ? state.conversationDeployments[conversationId] ?? EMPTY_DEPLOYMENTS
      : EMPTY_DEPLOYMENTS,
  );
  const deployBotToConversation = useStore((state) => state.deployBotToConversation);
  const undeployBotFromConversation = useStore((state) => state.undeployBotFromConversation);

  // Deployed agents come from the real backend deployment state
  // (GET /chat/conversations/:id/bots), mapped into the ChatAgent shape the
  // chat UI consumes. The demo registry is no longer consulted.
  const deployedChatAgents = useMemo<ChatAgent[]>(
    () =>
      deployments.map((d) => ({
        id: d.botId,
        type: 'custom',
        name: d.botName,
        avatar: 'bulb-outline',
        description: d.commandHint,
        capabilities: d.permissionsSnapshot,
        isDemo: false,
        isCustom: d.botType === 'custom',
      })),
    [deployments],
  );

  const refreshDeployments = useCallback(() => {
    if (!conversationId) return;
    fetchConversationDeploymentsFromApi(conversationId)
      .then((items) =>
        useStore.setState((s) => ({
          conversationDeployments: {
            ...s.conversationDeployments,
            [conversationId]: items,
          },
        })),
      )
      .catch(() => undefined);
  }, [conversationId]);

  useEffect(() => {
    refreshDeployments();
  }, [refreshDeployments]);

  const handleDeployChatAgent = useCallback(
    (agent: ChatAgent) => {
      if (!conversationId) return;
      haptic.success();
      const finish = () => {
        setChatAgentPickerVisible(false);
        show(`${agent.name} connected`, "success");
        setChatAgentSuggestions([]);
        refreshDeployments();
      };
      // ChatAgentPicker already deploys via the real API when a
      // conversationId is bound — deploy only if this agent is not yet
      // installed (defensive for callers that bypass the picker).
      if (deployments.some((d) => d.botId === agent.id)) {
        finish();
        return;
      }
      void deployBotToConversationOnApi(conversationId, agent.id)
        .then(() => {
          deployBotToConversation(conversationId, agent.id);
          finish();
        })
        .catch(() => show("Could not connect agent. Try again.", "error"));
    },
    [conversationId, deployments, haptic, show, deployBotToConversation, refreshDeployments],
  );

  const handleRemoveChatAgent = useCallback(
    (agentId: string) => {
      if (!conversationId) return;
      haptic.medium();
      void undeployBotFromConversationOnApi(conversationId, agentId)
        .then(() => {
          undeployBotFromConversation(conversationId, agentId);
          setChatAgentSuggestions([]);
          show("Agent removed", "info");
        })
        .catch(() => show("Could not remove agent. Try again.", "error"));
    },
    [conversationId, haptic, show, undeployBotFromConversation],
  );

  const handleSelectChatAgentSuggestion = useCallback(
    (reply: SuggestedReply) => {
      haptic.selection();
      setInput(reply.text);
    },
    [haptic, setInput],
  );

  // Connected agents from custom bots (for agent quick replies)
  const conversation = useStore((state) =>
    state.conversations.find((c) => c.id === conversationId),
  );
  const deployedBotIds = conversation?.botIds ?? [];
  const connectedAgents = useMemo(
    () =>
      customBots.filter(
        (bot) => deployedBotIds.includes(bot.id) && bot.runtimeMode === "ai",
      ),
    [customBots, deployedBotIds],
  );

  const agentQuickReplies = useMemo(
    () =>
      connectedAgents.slice(0, 3).map((agent) => {
        const starter = agent.agentConfig?.starterPrompts[0] ?? "";
        const invocation =
          agent.agentConfig?.triggerMode === "always"
            ? starter
            : agent.agentConfig?.triggerMode === "command"
              ? `${agent.commandHint}${starter ? ` ${starter}` : ""}`
              : `@${agent.slug}${starter ? ` ${starter}` : ""}`;
        return {
          label: starter || `Ask ${agent.name}`,
          onPress: () => setInput(invocation),
        };
      }),
    [connectedAgents, setInput],
  );

  return {
    chatAgentPickerVisible,
    setChatAgentPickerVisible,
    deployedChatAgents,
    chatAgentSuggestions,
    setChatAgentSuggestions,
    handleDeployChatAgent,
    handleRemoveChatAgent,
    handleSelectChatAgentSuggestion,
    agentQuickReplies,
  };
}
