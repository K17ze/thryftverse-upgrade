'use client';

/**
 * OrderTrackingSection — port of mobile OrderTrackingSection +
 * OrderTrackingTimeline. Tracking number row, ETA banner, stale-tracking
 * warning, latest event line, then the carrier-scan timeline.
 */

import { useMemo } from 'react';
import type { OrderTrackingEvent } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { EtaBanner } from './EtaBanner';
import { isInTransitStatus } from './orderCapabilities';

interface Props {
  trackingNumber?: string;
  carrier: string | null;
  service: string | null;
  isBuyer: boolean;
  status: string;
  etaWindow: string | null;
  estimatedDeliveryAt: string | null;
  serviceName: string | null;
  events: OrderTrackingEvent[];
  onCopyTracking?: () => void;
}

const STALE_MS = 48 * 3_600_000;

function eventTimeLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' · ' +
    at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function OrderTrackingSection({
  trackingNumber,
  carrier,
  service,
  isBuyer,
  status,
  etaWindow,
  estimatedDeliveryAt,
  serviceName,
  events,
  onCopyTracking,
}: Props) {
  const ordered = useMemo(
    () => [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    [events],
  );

  const latest = ordered.length > 0 ? ordered[ordered.length - 1] : null;

  const estimatedDeliveryMs = estimatedDeliveryAt
    ? new Date(estimatedDeliveryAt).getTime()
    : null;

  const showEta =
    isBuyer &&
    (etaWindow != null || estimatedDeliveryMs != null) &&
    isInTransitStatus(status) &&
    // The ETA disappears when stale — never show a false delivery promise.
    (estimatedDeliveryMs == null || estimatedDeliveryMs >= Date.now());

  const isStaleTracking =
    isInTransitStatus(status) &&
    latest != null &&
    Date.now() - new Date(latest.at).getTime() > STALE_MS;

  const estimatedDeliveryLabel =
    estimatedDeliveryMs != null && Number.isFinite(estimatedDeliveryMs)
      ? new Date(estimatedDeliveryMs).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
        })
      : null;

  return (
    <div className="flex flex-col gap-3" id="tracking">
      {/* Tracking number — the parcel identity, copyable. */}
      {trackingNumber ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon name="box" size={20} className="shrink-0 text-text-secondary" />
            <div>
              <p className="tnum text-body font-medium text-text-primary">{trackingNumber}</p>
              <p className="text-caption text-text-secondary">
                {[carrier ?? serviceName, service].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          {onCopyTracking ? (
            <Button variant="quiet" size="sm" icon="document" onClick={onCopyTracking}>
              Copy
            </Button>
          ) : null}
        </div>
      ) : null}

      {showEta ? (
        <EtaBanner
          etaWindow={etaWindow}
          estimatedDeliveryLabel={estimatedDeliveryLabel}
          serviceName={serviceName}
        />
      ) : null}

      {isStaleTracking ? (
        <p className="flex items-center gap-2 text-caption text-warning-text">
          <Icon name="clock" size={14} />
          Tracking hasn&apos;t updated in a while — your parcel may be delayed.
        </p>
      ) : null}

      {latest ? (
        <p className="clamp-1 text-caption text-text-muted">
          Latest: {latest.label}
          {latest.location ? ` — ${latest.location}` : ''} · {eventTimeLabel(latest.at)}
        </p>
      ) : null}

      {/* Carrier-scan trail — newest last, like the mobile timeline. */}
      {ordered.length > 0 ? (
        <ol className="flex flex-col">
          {ordered.map((event, i) => {
            const isLast = i === ordered.length - 1;
            const danger = event.tone === 'danger';
            const warning = event.tone === 'warning';
            return (
              <li key={event.id} className="flex gap-3">
                <div className="flex w-5 flex-col items-center">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      danger
                        ? 'bg-danger-subtle text-danger-text'
                        : warning
                          ? 'bg-warning-subtle text-warning-text'
                          : isLast
                            ? 'bg-commerce-trust-subtle text-commerce-trust'
                            : 'bg-surface-alt text-text-muted'
                    }`}
                  >
                    {danger ? (
                      <Icon name="alert" size={12} />
                    ) : isLast ? (
                      <Icon name="check" size={12} />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  {!isLast ? <span className="w-px flex-1 bg-border" aria-hidden /> : null}
                </div>
                <div className={isLast ? '' : 'pb-5'}>
                  <p
                    className={`text-body font-medium ${
                      danger ? 'text-danger-text' : isLast ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {event.label}
                  </p>
                  <p className="text-caption text-text-secondary">
                    {eventTimeLabel(event.at)}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                  {event.detail ? (
                    <p className="text-caption text-text-muted">{event.detail}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
