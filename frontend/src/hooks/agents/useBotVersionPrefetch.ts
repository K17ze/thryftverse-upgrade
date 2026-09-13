import React from 'react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';

/**
 * Custom bots plus a prefetch of each bot's versions so the agents list can
 * show the last published version. Runs once the shared Agent Studio
 * resources finish loading.
 */
export function useBotVersionPrefetch(agentsLoading: boolean) {
  const customBots = useStore(useShallow((s) => s.customBots));
  const botVersions = useStore(useShallow((s) => s.botVersions));
  const loadBotVersions = useStore((s) => s.loadBotVersions);

  // Load versions for each custom bot so we can show the last published version.
  React.useEffect(() => {
    if (agentsLoading) return;
    for (const bot of customBots) {
      if (!botVersions[bot.id]) {
        loadBotVersions(bot.id);
      }
    }
  }, [customBots, agentsLoading, botVersions, loadBotVersions]);

  return { customBots, botVersions };
}
