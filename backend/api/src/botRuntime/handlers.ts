/**
 * BotRuntime category handlers.
 *
 * Every handler reports verified runtime state or stays silent. Marketplace
 * and safety responses use live data loaded by the runtime orchestrator.
 */

import type { BotRuntimeContext, BotHandlerResult, BotCategoryHandler } from './types.js';

function buildHelpResponse(ctx: BotRuntimeContext, commands: string[]): BotHandlerResult {
  return {
    text: `${ctx.botName} is ready. Available commands:\n${commands.map((command) => `  ${command}`).join('\n')}`,
    metadata: { handler: 'help', category: ctx.botCategory },
    shouldReply: true,
  };
}

function formatListing(item: BotRuntimeContext['runtimeData']['listings'][number]): string {
  return `• ${item.title}${item.brand ? ` — ${item.brand}` : ''} · £${item.priceGbp.toFixed(2)}`;
}

export const assistantHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? '';
  if (subcommand === 'help' || subcommand === '') {
    return buildHelpResponse(ctx, [`${ctx.commandHint} help`, `${ctx.commandHint} status`]);
  }
  if (subcommand === 'status') {
    return {
      text: `${ctx.botName} is connected with permissions: ${ctx.permissionsSnapshot.join(', ') || 'none'}.`,
      metadata: { handler: 'status', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  return {
    text: `${ctx.botName}: Command not recognised. Use ${ctx.commandHint} help.`,
    metadata: { handler: 'unknown', category: ctx.botCategory },
    shouldReply: true,
  };
};

export const moderationHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? '';
  if (subcommand === 'rules') {
    return {
      text: [
        'Group rules:',
        '1. Be respectful.',
        '2. Do not spam.',
        '3. Keep payments and communication inside Thryftverse.',
        '4. Report suspicious activity through the member report flow.',
      ].join('\n'),
      metadata: { handler: 'rules', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  return buildHelpResponse(ctx, [`${ctx.commandHint} rules`]);
};

export const commerceHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? '';
  if (subcommand === 'help' || subcommand === '') {
    return buildHelpResponse(ctx, [
      `${ctx.commandHint} search <query>`,
      `${ctx.commandHint} trending`,
    ]);
  }

  if (subcommand === 'trending') {
    if (ctx.runtimeData.listings.length === 0) {
      return {
        text: `${ctx.botName}: No active marketplace listings are available right now.`,
        metadata: { handler: 'trending', category: ctx.botCategory, resultCount: 0 },
        shouldReply: true,
      };
    }

    return {
      text: [
        `${ctx.botName}: Popular this week`,
        ...ctx.runtimeData.listings.map(formatListing),
      ].join('\n'),
      metadata: {
        handler: 'trending',
        category: ctx.botCategory,
        listingIds: ctx.runtimeData.listings.map((item) => item.id),
      },
      shouldReply: true,
    };
  }

  if (subcommand === 'search') {
    const query = ctx.args.slice(1).join(' ').trim();
    if (!query) {
      return {
        text: `${ctx.botName}: Add what you want to find after “search”.`,
        metadata: { handler: 'search', category: ctx.botCategory, resultCount: 0 },
        shouldReply: true,
      };
    }
    if (ctx.runtimeData.listings.length === 0) {
      return {
        text: `${ctx.botName}: No active listings matched “${query}”.`,
        metadata: { handler: 'search', category: ctx.botCategory, query, resultCount: 0 },
        shouldReply: true,
      };
    }

    return {
      text: [
        `${ctx.botName}: Matches for “${query}”`,
        ...ctx.runtimeData.listings.map(formatListing),
      ].join('\n'),
      metadata: {
        handler: 'search',
        category: ctx.botCategory,
        query,
        listingIds: ctx.runtimeData.listings.map((item) => item.id),
      },
      shouldReply: true,
    };
  }

  return {
    text: `${ctx.botName}: Commerce command not recognised. Use ${ctx.commandHint} help.`,
    metadata: { handler: 'unknown', category: ctx.botCategory },
    shouldReply: true,
  };
};

export const safetyHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? '';
  if (subcommand === 'help' || subcommand === '') {
    return buildHelpResponse(ctx, [`${ctx.commandHint} check`]);
  }
  if (subcommand === 'check') {
    const reviewed = ctx.runtimeData.recentMessagesAnalyzed;
    const flagged = ctx.runtimeData.messagesRequiringReview;
    return {
      text: flagged > 0
        ? `${ctx.botName}: Reviewed ${reviewed} recent messages; ${flagged} should be checked by a moderator. This rules check is not a final safety decision.`
        : `${ctx.botName}: Reviewed ${reviewed} recent messages and found no configured risk phrases. This rules check is not a guarantee of safety.`,
      metadata: {
        handler: 'check',
        category: ctx.botCategory,
        reviewed,
        flagged,
      },
      shouldReply: true,
    };
  }
  return buildHelpResponse(ctx, [`${ctx.commandHint} check`]);
};

export const automationHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? '';
  if (subcommand === 'status') {
    return {
      text: `${ctx.botName}: Connected. This bot has no scheduled actions configured.`,
      metadata: { handler: 'status', category: ctx.botCategory, scheduledActions: 0 },
      shouldReply: true,
    };
  }
  return buildHelpResponse(ctx, [`${ctx.commandHint} status`]);
};

export const stylingHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const subcommand = ctx.args[0]?.toLowerCase() ?? '';
  if (subcommand === 'help' || subcommand === '') {
    return buildHelpResponse(ctx, [
      `${ctx.commandHint} outfit`,
      `${ctx.commandHint} palette`,
    ]);
  }
  if (subcommand === 'outfit') {
    if (ctx.runtimeData.listings.length === 0) {
      return {
        text: `${ctx.botName}: There are no active listings to build an outfit from right now.`,
        metadata: { handler: 'outfit', category: ctx.botCategory, resultCount: 0 },
        shouldReply: true,
      };
    }
    const selected = ctx.runtimeData.listings.slice(0, 3);
    return {
      text: [
        `${ctx.botName}: A marketplace outfit starting point`,
        ...selected.map(formatListing),
      ].join('\n'),
      metadata: {
        handler: 'outfit',
        category: ctx.botCategory,
        listingIds: selected.map((item) => item.id),
      },
      shouldReply: true,
    };
  }
  if (subcommand === 'palette') {
    return {
      text: `${ctx.botName}: Palette suggestions require colour data that listings do not currently provide.`,
      metadata: { handler: 'palette', category: ctx.botCategory, available: false },
      shouldReply: true,
    };
  }
  return {
    text: `${ctx.botName}: Style command not recognised. Use ${ctx.commandHint} help.`,
    metadata: { handler: 'unknown', category: ctx.botCategory },
    shouldReply: true,
  };
};

export const customBotHandler = (ctx: BotRuntimeContext): BotHandlerResult => ({
  text: '',
  metadata: {
    handler: 'custom',
    category: ctx.botCategory,
    custom: true,
    reason: 'custom agents require the configured AI runtime',
  },
  shouldReply: false,
});

const HANDLER_REGISTRY: Record<string, BotCategoryHandler> = {
  assistant: assistantHandler,
  moderation: moderationHandler,
  commerce: commerceHandler,
  safety: safetyHandler,
  automation: automationHandler,
  styling: stylingHandler,
  custom: customBotHandler,
};

export function resolveBotHandler(category: string): BotCategoryHandler | null {
  return HANDLER_REGISTRY[category] ?? null;
}
