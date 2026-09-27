'use client';

/**
 * Bot row grammar — flat rows over hairlines, one layout for the directory
 * (link to detail) and installed lists (link + run toggle). No cards.
 */

import Link from 'next/link';
import type { AgentBot } from '@/lib/contracts/agents';
import { triggerById } from '@/lib/contracts/agents';
import { formatCount } from '@/lib/utils/format';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/settings/Switch';
import { AgentIcon } from './AgentIcon';

interface BotRowProps {
  bot: AgentBot;
  /** Directory rows show install counts; installed rows show run state. */
  variant: 'directory' | 'installed';
  onToggle?: (enabled: boolean) => void;
}

export function BotRow({ bot, variant, onToggle }: BotRowProps) {
  const meta =
    variant === 'directory'
      ? `${bot.creator} · ${bot.model} · ${formatCount(bot.installs)} installs`
      : `${bot.model} · ${triggerById(bot.triggerId).label}`;

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
          <span className="clamp-1 mt-0.5 block text-meta text-text-muted">
            {meta}
            {variant === 'directory' && bot.installed ? ' · Installed' : ''}
          </span>
        </span>
        {variant === 'directory' ? (
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        ) : null}
      </Link>
      {variant === 'installed' && onToggle ? (
        <div className="shrink-0 pr-3 sm:pr-5">
          <Switch
            checked={bot.enabled}
            onChange={onToggle}
            aria-label={`${bot.enabled ? 'Pause' : 'Resume'} ${bot.name}`}
          />
        </div>
      ) : null}
    </div>
  );
}
