/**
 * BotRuntime category handlers.
 *
 * Every handler reports verified runtime state or stays silent. Marketplace
 * and safety responses use live data loaded by the runtime orchestrator.
 *
 * Every handler result includes an `explanation` field describing why the
 * agent produced its response, so the audit trail and UI can show the
 * rationale behind each action (2026 explainability standard).
 */

import type { BotRuntimeContext, BotHandlerResult, BotCategoryHandler } from './types.js';

function buildHelpResponse(ctx: BotRuntimeContext, commands: string[]): BotHandlerResult {
  return {
    text: `${ctx.botName} is ready. Available commands:\n${commands.map((command) => `  ${command}`).join('\n')}`,
    metadata: { handler: 'help', category: ctx.botCategory },
    shouldReply: true,
    confidence: 1.0,
    explanation: `User invoked ${ctx.commandHint} with no or "help" subcommand; returning the list of available commands for ${ctx.botName}.`,
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
      confidence: 1.0,
      explanation: `User requested status; reporting the live permissions snapshot (${ctx.permissionsSnapshot.length} permissions) for ${ctx.botName}.`,
    };
  }
  return {
    text: `${ctx.botName}: Command not recognised. Use ${ctx.commandHint} help.`,
    metadata: { handler: 'unknown', category: ctx.botCategory },
    shouldReply: true,
    confidence: 0.9,
    explanation: `User sent an unrecognised subcommand "${subcommand}"; directing them to the help text.`,
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
      confidence: 1.0,
      explanation: 'User requested group rules; returning the static moderation rule set.',
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
        confidence: 1.0,
        explanation: 'User requested trending listings; the live marketplace query returned zero active listings.',
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
      confidence: 1.0,
      explanation: `User requested trending listings; returning ${ctx.runtimeData.listings.length} listings ranked by recent interaction weight (purchases=4, wishlist=2, other=1) over the past 7 days.`,
    };
  }

  if (subcommand === 'search') {
    const query = ctx.args.slice(1).join(' ').trim();
    if (!query) {
      return {
        text: `${ctx.botName}: Add what you want to find after “search”.`,
        metadata: { handler: 'search', category: ctx.botCategory, resultCount: 0 },
        shouldReply: true,
        confidence: 1.0,
        explanation: 'User invoked search with no query term; prompting for a search term.',
      };
    }
    if (ctx.runtimeData.listings.length === 0) {
      return {
        text: `${ctx.botName}: No active listings matched “${query}”.`,
        metadata: { handler: 'search', category: ctx.botCategory, query, resultCount: 0 },
        shouldReply: true,
        confidence: 1.0,
        explanation: `User searched for “${query}”; the live marketplace query returned zero matching active listings.`,
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
      confidence: 1.0,
      explanation: `User searched for “${query}”; returning ${ctx.runtimeData.listings.length} active listings whose title, description, brand, or category matched, ranked by recent interaction weight.`,
    };
  }

  return {
    text: `${ctx.botName}: Commerce command not recognised. Use ${ctx.commandHint} help.`,
    metadata: { handler: 'unknown', category: ctx.botCategory },
    shouldReply: true,
    confidence: 0.9,
    explanation: `User sent an unrecognised commerce subcommand "${subcommand}"; directing them to the help text.`,
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
      confidence: 0.85,
      explanation: `Scanned ${reviewed} recent user messages in this conversation against configured risk-phrase patterns (scam, fraud, off-platform payment, gift card, crypto). ${flagged} message(s) matched and require moderator review. This is a heuristic rules check, not a final safety decision.`,
      needsHumanReview: flagged > 0,
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
      confidence: 1.0,
      explanation: 'User requested automation status; no scheduled actions are configured for this bot.',
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
        confidence: 1.0,
        explanation: 'User requested an outfit; the live marketplace query returned zero active listings to build from.',
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
      confidence: 0.8,
      explanation: `User requested an outfit; selected the top ${selected.length} of ${ctx.runtimeData.listings.length} active listings ranked by recent interaction weight as a starting point. This is a ranking heuristic, not a stylistic recommendation.`,
    };
  }
  if (subcommand === 'palette') {
    return {
      text: `${ctx.botName}: Palette suggestions require colour data that listings do not currently provide.`,
      metadata: { handler: 'palette', category: ctx.botCategory, available: false },
      shouldReply: true,
      confidence: 1.0,
      explanation: 'User requested colour palette suggestions; listings do not currently provide colour data, so this capability is honestly unavailable.',
    };
  }
  return {
    text: `${ctx.botName}: Style command not recognised. Use ${ctx.commandHint} help.`,
    metadata: { handler: 'unknown', category: ctx.botCategory },
    shouldReply: true,
    confidence: 0.9,
    explanation: `User sent an unrecognised styling subcommand "${subcommand}"; directing them to the help text.`,
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
  confidence: 0,
  explanation: 'Custom bot handler is a placeholder; custom agents require the AI runtime (openaiAgent) to produce a response.',
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
