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
  deployAgent as deployChatAgent,
  removeAgent as removeChatAgent,
  getDeployedAgents as getDeployedChatAgents,
  getAgentSuggestions as getChatAgentSuggestions,
  type ChatAgent,
  type SuggestedReply,
} from "../../services/chatAgentsApi";

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
  const [deployedChatAgents, setDeployedChatAgents] = useState<ChatAgent[]>([]);
  const [chatAgentSuggestions, setChatAgentSuggestions] = useState<SuggestedReply[]>([]);

  const customBots = useStore((state) => state.customBots);

  // Sync demo AI chat agents from the chatAgentsApi service for this conversation.
  useEffect(() => {
    if (!conversationId) return;
    setDeployedChatAgents(getDeployedChatAgents(conversationId));
  }, [conversationId]);

  const handleDeployChatAgent = useCallback(
    (agent: ChatAgent) => {
      if (!conversationId) return;
      haptic.success();
      deployChatAgent(conversationId, agent.type);
      setDeployedChatAgents(getDeployedChatAgents(conversationId));
      setChatAgentPickerVisible(false);
      show(`${agent.name} connected`, "success");
      setChatAgentSuggestions(getChatAgentSuggestions(conversationId, ""));
    },
    [conversationId, haptic, show],
  );

  const handleRemoveChatAgent = useCallback(
    (agentId: string) => {
      if (!conversationId) return;
      haptic.medium();
      removeChatAgent(conversationId, agentId);
      setDeployedChatAgents(getDeployedChatAgents(conversationId));
      setChatAgentSuggestions([]);
      show("Agent removed", "info");
    },
    [conversationId, haptic, show],
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
