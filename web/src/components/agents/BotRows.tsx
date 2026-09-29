'use client';

/**
 * Bot row grammar — flat rows over hairlines, one layout for the directory
 * (link to detail) and "your agents" rows (link + status toggle). Meta is
 * assembled only from fields the row actually carries: creator, model when
 * agentConfig ships one, the trigger grammar that exists (fixture
 * automation, live chat triggerMode), authored install counts (fixture
 * only), and the live wire status. No fabricated fields, no cards.
 */

import Link from 'next/link';
import type { AgentBot } from '@/lib/contracts/agents';
import {
  AGENT_BOT_STATUS_LABELS,
  triggerById,
  triggerModeById,
} from '@/lib/contracts/agents';
import { formatCount } from '@/lib/utils/format';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/settings/Switch';
import { AgentIcon } from './AgentIcon';

interface BotRowProps {
  bot: AgentBot;
  /** Directory rows are read-only capability entries; "installed" rows are
   *  the caller's own bots (or fixture installs) and may carry a toggle. */
  variant: 'directory' | 'installed';
  onToggle?: (enabled: boolean) => void;
}

export function BotRow({ bot, variant, onToggle }: BotRowProps) {
  const parts: string[] = [];
  if (variant === 'directory') {
    parts.push(bot.creator);
  } else if (bot.isDraft) {
    parts.push('Draft');
  }
  if (bot.model) parts.push(bot.model);
  if (bot.triggerId) parts.push(triggerById(bot.triggerId).label);
  else if (bot.triggerMode) parts.push(triggerModeById(bot.triggerMode).label);
  if (variant === 'directory' && typeof bot.installs === 'number') {
    parts.push(`${formatCount(bot.installs)} installs`);
  }
  if (bot.status) parts.push(AGENT_BOT_STATUS_LABELS[bot.status]);
  const meta = parts.join(' · ');

  // The toggle is a PATCH on chat_bots — the server only accepts it from
  // the owner of a custom bot. Wire rows (status present) require
  // canToggle; fixture rows express state through `enabled` alone.
  const toggleable = bot.status === undefined || bot.canToggle === true;

  return (
    <div className="relative flex min-h-[68px] items-center gap-3.5 py-3">
      <Link
        href={`/agents/${bot.id}`}
        className="pressable flex min-w-0 flex-1 items-center gap-3.5 px-4 sm:px-6"
        aria-label={`View ${bot.name}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center text-text-primary">
          <AgentIcon category={bot.category} name={bot.name} size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
            {bot.name}
          </span>
          <span className="clamp-1 mt-0.5 block text-caption text-text-secondary">
            {bot.purpose}
          </span>
          {meta ? (
            <span className="clamp-1 mt-0.5 block text-meta text-text-muted">
              {meta}
              {variant === 'directory' && bot.installed === true ? ' · Installed' : ''}
            </span>
          ) : null}
        </span>
        {variant === 'directory' ? (
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        ) : null}
      </Link>
      {variant === 'installed' && onToggle && toggleable ? (
        <div className="shrink-0 pr-3 sm:pr-5">
          <Switch
            checked={bot.enabled}
            onChange={onToggle}
            aria-label={`${bot.enabled ? 'Disable' : 'Enable'} ${bot.name}`}
          />
        </div>
      ) : null}
    </div>
  );
}
