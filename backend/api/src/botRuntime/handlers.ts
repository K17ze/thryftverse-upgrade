/**
 * BotRuntime — Category-specific command handlers
 *
 * Each handler receives runtime context and returns a response.
 * These are lightweight placeholder implementations that demonstrate
 * the bot execution pipeline. AI/ML integrations can replace them.
 */

import type { BotRuntimeContext, BotHandlerResult, BotCategoryHandler } from './types.js';

function buildHelpResponse(ctx: BotRuntimeContext, commands: string[]): BotHandlerResult {
  return {
    text: `${ctx.botName} is ready. Available commands:\n${commands.map((c) => `  ${c}`).join('\n')}`,
    metadata: { handler: 'help', category: ctx.botCategory },
    shouldReply: true,
  };
}

export const assistantHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const sub = ctx.args[0]?.toLowerCase() ?? '';
  if (sub === 'help' || sub === '') {
    return buildHelpResponse(ctx, [`${ctx.commandHint} help`, `${ctx.commandHint} status`]);
  }
  if (sub === 'status') {
    return {
      text: `${ctx.botName} status: online, permissions: ${ctx.permissionsSnapshot.join(', ') || 'none'}.`,
      metadata: { handler: 'status', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  return {
    text: `${ctx.botName}: I'm here to help. What can I do for you?`,
    metadata: { handler: 'assistant', category: ctx.botCategory },
    shouldReply: true,
  };
};

export const moderationHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const sub = ctx.args[0]?.toLowerCase() ?? '';
  if (sub === 'help' || sub === '') {
    return buildHelpResponse(ctx, [
      `${ctx.commandHint} warn @user [reason]`,
      `${ctx.commandHint} rules`,
    ]);
  }
  if (sub === 'rules') {
    return {
      text: `Group rules enforced by ${ctx.botName}:\n1. Be respectful.\n2. No spam.\n3. No scams.\n4. Report suspicious activity.`,
      metadata: { handler: 'rules', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  return {
    text: `${ctx.botName}: Moderation action recorded.`,
    metadata: { handler: 'moderation', category: ctx.botCategory, sub },
    shouldReply: true,
  };
};

export const commerceHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const sub = ctx.args[0]?.toLowerCase() ?? '';
  if (sub === 'help' || sub === '') {
    return buildHelpResponse(ctx, [
      `${ctx.commandHint} search <query>`,
      `${ctx.commandHint} trending`,
    ]);
  }
  if (sub === 'trending') {
    return {
      text: `${ctx.botName}: Trending items today — check the marketplace tab for live data.`,
      metadata: { handler: 'trending', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  if (sub === 'search') {
    const query = ctx.args.slice(1).join(' ') || 'all';
    return {
      text: `${ctx.botName}: Searching for "${query}"... (connect a search backend for live results)`,
      metadata: { handler: 'search', category: ctx.botCategory, query },
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
  const sub = ctx.args[0]?.toLowerCase() ?? '';
  if (sub === 'help' || sub === '') {
    return buildHelpResponse(ctx, [`${ctx.commandHint} check`, `${ctx.commandHint} report @user`]);
  }
  if (sub === 'check') {
    return {
      text: `${ctx.botName}: Safety scan complete. No violations detected in recent messages.`,
      metadata: { handler: 'check', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  return {
    text: `${ctx.botName}: Safety action recorded.`,
    metadata: { handler: 'safety', category: ctx.botCategory, sub },
    shouldReply: true,
  };
};

export const automationHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const sub = ctx.args[0]?.toLowerCase() ?? '';
  if (sub === 'help' || sub === '') {
    return buildHelpResponse(ctx, [
      `${ctx.commandHint} status`,
      `${ctx.commandHint} schedule`,
    ]);
  }
  if (sub === 'status') {
    return {
      text: `${ctx.botName}: Automation engine online. 0 scheduled tasks running.`,
      metadata: { handler: 'status', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  return {
    text: `${ctx.botName}: Automation command received.`,
    metadata: { handler: 'automation', category: ctx.botCategory, sub },
    shouldReply: true,
  };
};

export const stylingHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  const sub = ctx.args[0]?.toLowerCase() ?? '';
  if (sub === 'help' || sub === '') {
    return buildHelpResponse(ctx, [
      `${ctx.commandHint} outfit`,
      `${ctx.commandHint} palette`,
    ]);
  }
  if (sub === 'outfit') {
    return {
      text: `${ctx.botName}: Outfit suggestion — connect a style backend for personalised recommendations.`,
      metadata: { handler: 'outfit', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  if (sub === 'palette') {
    return {
      text: `${ctx.botName}: Colour palette — connect a style backend for personalised palettes.`,
      metadata: { handler: 'palette', category: ctx.botCategory },
      shouldReply: true,
    };
  }
  return {
    text: `${ctx.botName}: Style command not recognised. Use ${ctx.commandHint} help.`,
    metadata: { handler: 'unknown', category: ctx.botCategory },
    shouldReply: true,
  };
};

export const customBotHandler = (ctx: BotRuntimeContext): BotHandlerResult => {
  return {
    text: `${ctx.botName} (${ctx.botSlug}): "${ctx.messageText}" — custom bot response placeholder.`,
    metadata: { handler: 'custom', category: ctx.botCategory, custom: true },
    shouldReply: true,
  };
};

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
