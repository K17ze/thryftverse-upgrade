'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Switch } from '@/components/settings/Switch';
import { formatDate } from '@/lib/utils/format';
import type { CoOwnAlert } from '../alertStore';
import { gbp } from '../format';

/** Desktop column track — asset | trigger | status | set | actions.
 *  Shared by the per-section column head and each row's lg grid; the
 *  link's wrappers dissolve via display:contents to land on it. */
export const ALERT_GRID =
  'lg:grid-cols-[2.25rem_minmax(0,1.5fr)_8rem_6.5rem_6.5rem_auto]';
const HEAD_CELL =
  'text-micro font-semibold uppercase tracking-[0.08em] text-text-muted';

/** Column head for one alerts group — decorative alignment only (the
 *  rows are a ul, not a table), so it stays aria-hidden. */
export function AlertsTableHead() {
  return (
    <div
      aria-hidden="true"
      className={`mt-3 hidden lg:grid ${ALERT_GRID} lg:gap-x-5 border-y border-border-subtle py-2`}
    >
      <span />
      <span className={HEAD_CELL}>Asset</span>
      <span className={HEAD_CELL}>Trigger</span>
      <span className={HEAD_CELL}>Status</span>
      <span className={HEAD_CELL}>Set</span>
      <span />
    </div>
  );
}

export function AlertRow({
  alert,
  title,
  paused,
  fired,
  onToggle,
  onDelete,
}: {
  alert: CoOwnAlert;
  title: string;
  paused: boolean;
  fired: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isAbove = alert.direction === 'above';
  const status = fired ? 'Triggered' : paused ? 'Paused' : 'Active';
  return (
    <li
      className={`flex items-center gap-3 py-3.5 lg:grid ${ALERT_GRID} lg:gap-x-5 lg:has-[:focus-visible]:bg-surface-alt/60 ${
        paused && !fired ? 'opacity-60' : ''
      }`}
    >
      <Link
        href={`/co-own/${alert.assetId}`}
        className="pressable flex min-w-0 flex-1 items-center gap-3 lg:contents"
        aria-label={`View ${title}`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            fired
              ? 'bg-brand-subtle text-brand'
              : paused
                ? 'bg-surface-alt text-text-muted'
                : isAbove
                  ? 'bg-coown-up-subtle text-coown-up'
                  : 'bg-coown-down-subtle text-coown-down'
          }`}
        >
          <Icon
            name={fired ? 'check' : isAbove ? 'chevronUp' : 'chevronDown'}
            filled={fired}
            size={16}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body text-text-secondary">
            <span className="clamp-1 font-semibold text-text-primary">{title}</span>
            {/* Trigger joins the title inline on mobile; at lg it's its
                own column. */}
            <span className="text-text-muted lg:hidden"> · </span>
            <span className="tnum lg:hidden">
              {isAbove ? 'Above' : 'Below'} {gbp(alert.targetPriceGbp)}
            </span>
          </span>
          {/* Compact meta — mobile only; at lg the same facts render as
              their own table cells so the row reads as columns. */}
          <span className="mt-0.5 block text-meta text-text-muted lg:hidden">
            {fired && alert.triggeredAt
              ? `Fired ${formatDate(alert.triggeredAt)} — price crossed your target · set ${formatDate(alert.createdAt)}`
              : `${paused ? 'Paused · ' : ''}Alerts when the last-trade price ${
                  isAbove ? 'rises above' : 'drops below'
                } ${gbp(alert.targetPriceGbp)} · set ${formatDate(alert.createdAt)}`}
          </span>
        </span>
      </Link>
      {/* Desktop cells — trigger, state and set-date as real columns. */}
      <span className="hidden text-body text-text-secondary tnum lg:block">
        {isAbove ? 'Above' : 'Below'} {gbp(alert.targetPriceGbp)}
      </span>
      <span className="hidden lg:block">
        <span className="block text-caption font-medium text-text-secondary">
          {status}
        </span>
        {fired && alert.triggeredAt ? (
          <span className="mt-0.5 block text-meta text-text-muted tnum">
            {formatDate(alert.triggeredAt)}
          </span>
        ) : null}
      </span>
      <span className="hidden text-body text-text-muted tnum lg:block">
        {formatDate(alert.createdAt)}
      </span>
      {/* Fired alerts keep the switch — re-enabling re-arms the alert
          (server clears triggered_at; the device store mirrors it). */}
      <div className="flex shrink-0 items-center gap-3 lg:justify-self-end">
        <Switch
          checked={alert.active}
          onChange={onToggle}
          aria-label={
            alert.active
              ? `Pause alert for ${title}`
              : `Enable alert for ${title}`
          }
        />
        <button
          type="button"
          aria-label="Delete alert"
          onClick={onDelete}
          className="pressable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-danger-text hover:bg-danger-subtle"
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
    </li>
  );
}
