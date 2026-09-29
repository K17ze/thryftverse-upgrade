'use client';

/**
 * BotBuilder — /agents/builder: name, a fixed purpose template (the
 * permission set comes with the job, never free-composed), and the reply
 * grammar the wire actually supports.
 *
 * Live mode creates a custom bot draft (POST /bots with isDraft + a real
 * agentConfig — instructions composed from the job description, the
 * 'reply_in_chat' permission publish validation requires). A failed save
 * surfaces the server error verbatim and never wedges `saving`. Fixture
 * mode keeps the authored session-bot behaviour.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import type {
  AgentPurposeId,
  AgentTriggerId,
  AgentTriggerMode,
} from '@/lib/contracts/agents';
import {
  AGENT_PURPOSES,
  AGENT_TRIGGERS,
  AGENT_TRIGGER_MODES,
  CAPABILITY_RISK_LABELS,
  purposeById,
  riskWord,
} from '@/lib/contracts/agents';
import { useAgentActions } from '@/lib/hooks/agents-queries';
import { AgentsSignInWall, useAgentsAccess } from './AgentsGate';
import { AgentIcon } from './AgentIcon';
import { PermissionRow } from './AgentRunRow';

export function BotBuilder() {
  const router = useRouter();
  const { show } = useToast();
  const { createBot, setEnabled: setBotEnabled } = useAgentActions();
  const access = useAgentsAccess();
  const isLive = DATA_MODE === 'live';

  const [name, setName] = useState('');
  const [purposeId, setPurposeId] = useState<AgentPurposeId>('listing_copilot');
  const [triggerId, setTriggerId] = useState<AgentTriggerId>(
    purposeById('listing_copilot')?.defaultTrigger ?? 'manual',
  );
  const [triggerMode, setTriggerMode] = useState<AgentTriggerMode>('mention');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const purpose = purposeById(purposeId);
  const allowedTriggers = useMemo(
    () => AGENT_TRIGGERS.filter((t) => purpose?.triggers.includes(t.value)),
    [purpose],
  );

  const nameTrimmed = name.trim();
  const nameError =
    name.length > 0 && nameTrimmed.length < 3
      ? 'Give it at least 3 characters.'
      : null;
  const canCreate = nameTrimmed.length >= 3 && !!purpose && !saving;

  const pickPurpose = (id: AgentPurposeId) => {
    setPurposeId(id);
    const next = purposeById(id);
    if (next && !next.triggers.includes(triggerId)) {
      setTriggerId(next.defaultTrigger);
    }
  };

  const handleCreate = async () => {
    if (!canCreate || saving) return;
    setSaving(true);
    try {
      const bot = await createBot({
        name: nameTrimmed,
        purposeId,
        triggerId,
        triggerMode,
        enabled,
      });
      // POST /bots always creates with status 'available' — the
      // start-disabled choice is a second, awaited write so a failure is
      // reported honestly instead of silently shipping an enabled bot.
      if (isLive && !enabled) {
        try {
          await setBotEnabled(bot.id, false);
        } catch (err) {
          show(
            `${bot.name} created — couldn't disable it: ${parseApiError(err).message}`,
            'error',
          );
        }
      }
      show(`${bot.name} created`, 'success');
      router.push(`/agents/${bot.id}`);
    } catch (err) {
      // Server errors arrive verbatim — CHAT_BOT_INVALID and friends.
      show(parseApiError(err, 'Couldn’t create the agent').message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (access === 'blocked') {
    return (
      <div className="pb-16">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
          <h1 className="flex-1 text-screen-title text-text-primary">New agent</h1>
        </div>
        <AgentsSignInWall title="Sign in to build an agent" />
      </div>
    );
  }

  if (access === 'loading') {
    return (
      <div className="pb-16">
        <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
          <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
          <h1 className="flex-1 text-screen-title text-text-primary">New agent</h1>
        </div>
        <div className="mt-8 px-4 sm:px-6" aria-busy aria-label="Loading builder">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-11 w-full max-w-[460px] rounded-lg" />
          <Skeleton className="mt-8 h-4 w-24" />
          <Skeleton className="mt-3 h-14 w-full" />
          <Skeleton className="mt-px h-14 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
        <h1 className="flex-1 text-screen-title text-text-primary">
          New agent
        </h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        Pick a job. The permissions come with it — you can&rsquo;t grant it more
        than the job needs.
      </p>

      {/* Builder columns — the form runs down the main column; the fixed
          permission preview, run state and create CTA sit in a sticky
          right rail at lg. On mobile the rail content flows after the
          trigger section, same order as before. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-12">
      <div className="min-w-0">
      {/* Identity */}
      <section aria-label="Name" className="mt-8">
        <h2 className="px-4 text-label text-text-muted sm:px-6">
          Name
        </h2>
        <div className="mt-2 px-4 sm:px-6 lg:max-w-[460px]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekend relister"
            maxLength={40}
            aria-label="Agent name"
            aria-invalid={!!nameError}
            className="h-11 w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
          />
          {nameError ? (
            <p className="mt-1.5 text-caption text-danger-text">{nameError}</p>
          ) : null}
        </div>
      </section>

      {/* Purpose — fixed capability templates */}
      <section aria-label="Purpose" className="mt-8">
        <h2 className="px-4 text-label text-text-muted sm:px-6">
          Purpose
        </h2>
        <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle" role="radiogroup" aria-label="Agent purpose">
          {AGENT_PURPOSES.map((p) => {
            const selected = p.id === purposeId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => pickPurpose(p.id)}
                className="pressable flex w-full items-center gap-3.5 px-4 py-3.5 text-left sm:px-6"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center text-text-primary">
                  <AgentIcon category={p.category} name={p.label} size={21} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-emphasis font-medium text-text-primary">
                    {p.label}
                  </span>
                  <span className="clamp-2 mt-0.5 block text-caption text-text-secondary">
                    {p.detail}
                  </span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-brand bg-brand text-text-inverse' : 'border-border'
                  }`}
                >
                  {selected ? <Icon name="check" size={12} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* When it replies — live mode offers the wire's trigger grammar
          (agentConfig.triggerMode); fixture mode keeps the authored
          automation triggers scoped to the purpose. */}
      <section aria-label="Trigger" className="mt-8">
        <h2 className="px-4 text-label text-text-muted sm:px-6">
          {isLive ? 'When it replies' : 'When it runs'}
        </h2>
        <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle" role="radiogroup" aria-label="Trigger rule">
          {(isLive ? AGENT_TRIGGER_MODES : allowedTriggers).map((t) => {
            const selected = isLive
              ? t.value === triggerMode
              : t.value === triggerId;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() =>
                  isLive
                    ? setTriggerMode(t.value as AgentTriggerMode)
                    : setTriggerId(t.value as AgentTriggerId)
                }
                className="pressable flex w-full items-center gap-3.5 px-4 py-3 text-left sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-text-primary">
                    {t.label}
                  </span>
                  <span className="block text-caption text-text-muted">{t.detail}</span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? 'border-brand bg-brand text-text-inverse' : 'border-border'
                  }`}
                >
                  {selected ? <Icon name="check" size={12} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
      {/* What it will get — the template's fixed grants, read-only preview.
          Live creates also carry 'reply_in_chat' — it's written to the bot
          so the row shows it. */}
      {purpose ? (
        <section aria-label="Permissions" className="mt-8">
          <h2 className="px-4 text-label text-text-muted sm:px-6">
            What it gets
          </h2>
          <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
            {purpose.capabilities.map((cap) => (
              <PermissionRow
                key={cap}
                label={CAPABILITY_RISK_LABELS[cap].label}
                riskWord={riskWord(CAPABILITY_RISK_LABELS[cap].risk)}
              />
            ))}
            {isLive ? (
              <PermissionRow label="Reply in chat" riskWord="Acts for you" />
            ) : null}
          </ul>
          <p className="mt-3 px-4 text-caption text-text-muted sm:px-6">
            {isLive
              ? 'Fixed by the template — plus the reply grant every chat agent needs.'
              : 'Fixed by the template. Drafts wait for you — it can’t publish, message, or spend money.'}
          </p>
        </section>
      ) : null}

      {/* Run state + create */}
      <section aria-label="Finish" className="mt-8">
        <div className="flex items-center gap-3 border-y border-border-subtle px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">
              {isLive ? 'Enabled' : 'Start running'}
            </p>
            <p className="mt-0.5 text-caption text-text-muted">
              {isLive
                ? 'A disabled agent stays yours but won’t reply.'
                : 'You can pause it any time from Your agents.'}
            </p>
          </div>
          <Switch checked={enabled} onChange={setEnabled} aria-label="Start running" />
        </div>
        <div className="px-4 pt-6 sm:px-6">
          <Button fullWidth size="lg" disabled={!canCreate} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create agent'}
          </Button>
          <p className="mt-3 text-center text-meta text-text-muted">
            {isLive
              ? 'Saved as a draft under Your agents — it can’t join a conversation until it’s published.'
              : 'Session agent — it lives in this app session and shows up in Your agents.'}
          </p>
        </div>
      </section>
      </div>
      </div>
    </div>
  );
}
