'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { formatDate } from '@/lib/utils/format';
import { useShopAway, useUpdateShopAway } from '@/lib/hooks/seller-queries';

const INPUT_CLASS =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

/** The smallest valid return date — the backend rejects past dates too. */
function tomorrowInputValue(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

export function HolidayModeSection() {
  const { show } = useToast();
  const away = useShopAway();
  const updateAway = useUpdateShopAway();

  const [untilInput, setUntilInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!away.data || hydratedFor === 'yes') return;
    setUntilInput(toDateInputValue(away.data.holidayModeUntil));
    setMessageInput(away.data.awayMessage ?? '');
    setHydratedFor('yes');
  }, [away.data, hydratedFor]);

  const onToggle = (next: boolean) => {
    updateAway.mutate(
      next
        ? {
            holidayMode: true,
            holidayModeUntil: away.data?.holidayModeUntil ?? null,
            awayMessage: away.data?.awayMessage ?? null,
          }
        : { holidayMode: false, holidayModeUntil: null, awayMessage: null },
      {
        onSuccess: () =>
          show(
            next
              ? 'Holiday mode on — your shop is paused for buyers'
              : 'Holiday mode off — your listings are visible again',
            'success',
          ),
        onError: () =>
          show('Could not update holiday mode — try again', 'error'),
      },
    );
  };

  const commitReturnDate = (value: string) => {
    setUntilInput(value);
    if (!value) {
      updateAway.mutate({
        holidayMode: true,
        holidayModeUntil: null,
        awayMessage: away.data?.awayMessage ?? null,
      });
      return;
    }
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      show('Return date has to be in the future', 'error');
      return;
    }
    updateAway.mutate(
      {
        holidayMode: true,
        holidayModeUntil: new Date(parsed).toISOString(),
        awayMessage: away.data?.awayMessage ?? null,
      },
      { onError: () => show('Could not save the return date', 'error') },
    );
  };

  const commitMessage = () => {
    const message = messageInput.trim();
    const current = away.data?.awayMessage ?? '';
    if (message === current) return;
    updateAway.mutate(
      {
        holidayMode: true,
        holidayModeUntil: away.data?.holidayModeUntil ?? null,
        awayMessage: message || null,
      },
      { onError: () => show('Could not save the away message', 'error') },
    );
  };

  const holidayMode = away.data?.holidayMode === true;
  const busy = updateAway.isPending;

  return (
    <section aria-label="Holiday mode" className="mt-8">
      <h2 className="text-section-title font-semibold text-text-primary">Shop activity</h2>
      <div className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        <div className="flex items-center gap-3 py-3.5">
          <Icon name="bag" size={20} className="shrink-0 text-text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis font-medium text-text-primary">Holiday mode</p>
            <p className="mt-0.5 text-meta text-text-muted">
              Pause your listings and hide your shop while you&apos;re away
            </p>
          </div>
          <Switch
            checked={holidayMode}
            onChange={onToggle}
            disabled={busy}
            aria-label="Holiday mode — pause your shop for buyers"
          />
        </div>

        {holidayMode ? (
          <>
            <div className="flex items-center gap-3 py-3.5">
              <Icon name="clock" size={20} className="shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="away-return-date"
                  className="block text-body-emphasis font-medium text-text-primary"
                >
                  Return date
                </label>
                <p className="mt-0.5 text-meta text-text-muted">
                  {away.data?.holidayModeUntil
                    ? `Buyers see "back ${formatDate(away.data.holidayModeUntil)}" — your shop stays paused until then`
                    : 'Optional — buyers see your shop as paused until you return'}
                </p>
              </div>
              <input
                id="away-return-date"
                type="date"
                value={untilInput}
                min={tomorrowInputValue()}
                disabled={busy}
                onChange={(e) => commitReturnDate(e.target.value)}
                className={`${INPUT_CLASS} w-40`}
              />
            </div>

            <div className="flex items-start gap-3 py-3.5">
              <Icon name="chat" size={20} className="mt-2.5 shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="away-message"
                  className="block text-body-emphasis font-medium text-text-primary"
                >
                  Away message
                </label>
                <p className="mt-0.5 text-meta text-text-muted">
                  Optional — shown on your shop while you&apos;re away
                </p>
                <textarea
                  id="away-message"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onBlur={commitMessage}
                  rows={2}
                  maxLength={160}
                  disabled={busy}
                  placeholder="e.g. Away until Monday — orders ship when I'm back"
                  className="mt-2 w-full resize-y rounded-md border border-border bg-input px-3.5 py-2.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-meta text-text-muted">
        <Icon name="info" size={14} className="mt-px shrink-0" />
        {DATA_MODE === 'live'
          ? 'Saved to your account — buyers see the pause immediately.'
          : 'Demo mode — saved on this device; fixture listings pause for buyers in this session.'}
      </p>
      {updateAway.isError ? (
        <p role="alert" className="mt-2 text-caption text-danger-text">
          We couldn&apos;t save that change — it wasn&apos;t applied. Try again.
        </p>
      ) : null}
    </section>
  );
}
