'use client';

import { useMemo } from 'react';
import {
  CAPABILITY_RISK_LABELS,
  RISK_GROUPS,
  isAgentCapability,
  riskWord,
  type AgentBot,
  type RiskLevel,
} from '@/lib/contracts/agents';
import { PermissionRow } from '../AgentRunRow';

export function BotPermissionsSection({ bot }: { bot: AgentBot }) {
  // Permissions grouped by risk tier, in the mobile builder's display order.
  const grantsByRisk = useMemo(() => {
    const order: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    return order
      .map((risk) => ({
        group: RISK_GROUPS.find((g) => g.risk === risk)!,
        capabilities: bot.capabilities.filter(
          (c) => isAgentCapability(c) && CAPABILITY_RISK_LABELS[c].risk === risk,
        ),
      }))
      .filter((entry) => entry.capabilities.length > 0);
  }, [bot.capabilities]);

  // Wire permissions that aren't in the web capability taxonomy (e.g.
  // 'reply_in_chat') are still the bot's real grants — show them verbatim.
  const otherPermissions = (bot.permissions ?? []).filter(
    (p) => !isAgentCapability(p),
  );

  return (
    <section aria-label="Permissions" className="mt-8 lg:col-start-1">
      <h2 className="px-4 text-label text-text-muted sm:px-6">
        What it needs
      </h2>
      {grantsByRisk.map(({ group, capabilities }) => (
        <div key={group.risk} className="mt-4">
          <p className="px-4 text-caption font-medium text-text-secondary sm:px-6">
            {group.title}
            <span className="text-text-muted"> — {group.hint}</span>
          </p>
          <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
            {capabilities.map((cap) => (
              <PermissionRow
                key={cap}
                label={CAPABILITY_RISK_LABELS[cap].label}
                riskWord={riskWord(CAPABILITY_RISK_LABELS[cap].risk)}
              />
            ))}
          </ul>
        </div>
      ))}
      {otherPermissions.length > 0 ? (
        <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
          {otherPermissions.map((p) => (
            <PermissionRow key={p} label={p} riskWord="Declared" />
          ))}
        </ul>
      ) : null}
      {grantsByRisk.length === 0 && otherPermissions.length === 0 ? (
        <p className="mt-2 px-4 text-caption text-text-muted sm:px-6">
          This agent declares no permissions.
        </p>
      ) : null}
      {/* Fixture rows carry only the conservative template grants, so the
          assurance holds there; a wire bot can reply in chat and we say
          nothing it can't back up. */}
      {bot.permissions === undefined ? (
        <p className="mt-3 px-4 text-caption text-text-muted sm:px-6">
          It can&rsquo;t spend money, publish, or message on your behalf. Ask-first
          actions always wait for you.
        </p>
      ) : null}
    </section>
  );
}
