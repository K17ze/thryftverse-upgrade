'use client';

/**
 * NewTicketForm — the contact CTA's inline form: topic select, the order
 * this request is about, message. Creates the case in session state and
 * hands the caller the new ticket for navigation. Outcome preview per
 * topic mirrors OrderSupportScreen's honest expectation-setting.
 *
 * Live mode POSTs /support/tickets, which is order-bound — the order
 * picker lists the caller's real orders (GET /users/:id/orders) and the
 * form cannot submit without one. There is no unbound case-create route;
 * a user with no orders gets the honest note instead of a dead submit.
 * Fixture mode keeps the picker optional ("general question").
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import {
  SUPPORT_TOPICS,
  topicById,
  type SupportTopicId,
} from '@/lib/contracts/support';
import { DATA_MODE } from '@/lib/api/client';
import { fetchOrders } from '@/lib/api/services/commerce';
import { ORDERS } from '@/lib/data/fixtures';
import {
  EvidencePhotoField,
  type EvidencePhoto,
} from '@/components/orders/EvidencePhotoField';
import { useSupportActions } from './useSupportTickets';

const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

interface OrderOption {
  id: string;
  label: string;
}

function orderOption(o: { id: string; status: string }): OrderOption {
  return {
    id: o.id,
    label: `Order ${o.id} · ${o.status}`,
  };
}

interface NewTicketFormProps {
  onCreated: (ticketId: string) => void;
  onCancel: () => void;
  /** Preselects the topic — the hub's shortcut row passes one through. */
  initialTopic?: SupportTopicId;
}

export function NewTicketForm({ onCreated, onCancel, initialTopic }: NewTicketFormProps) {
  const { createTicket } = useSupportActions();
  const { show } = useToast();
  const [topicId, setTopicId] = useState<SupportTopicId | ''>(initialTopic ?? '');
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [evidence, setEvidence] = useState<EvidencePhoto[]>([]);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Order picker — live: the caller's own orders (buyer + seller roles,
  // the ticket route accepts either party). Fixture: the catalogue's
  // session orders.
  const ordersQuery = useQuery({
    queryKey: ['support-order-picker'],
    queryFn: ({ signal }) =>
      fetchOrders({ role: 'all', limit: 20 }, signal).then((p) => p.items),
    enabled: DATA_MODE === 'live',
    staleTime: 60_000,
  });

  const isLive = DATA_MODE === 'live';
  const orderOptions: OrderOption[] = isLive
    ? (ordersQuery.data ?? []).map(orderOption)
    : ORDERS.map(orderOption);
  const ordersLoading = isLive && ordersQuery.isLoading;
  const ordersEmpty = isLive && ordersQuery.isSuccess && orderOptions.length === 0;

  const topic = topicId ? topicById(topicId) : undefined;
  // Evidence mid-upload can't submit — a submitted ticket must carry the
  // real uploaded URLs, not still-uploading blob previews.
  const uploading = evidence.some((e) => e.state === 'uploading');
  // Live tickets are order-bound — the order is required, never faked.
  const orderOk = isLive ? orderId !== '' : true;
  const canSubmit =
    topicId !== '' && orderOk && message.trim().length >= 10 && !submitting && !ordersLoading && !uploading;

  const submit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const ticket = await createTicket({
        topicId,
        orderRef: orderId || null,
        message: message.trim(),
        evidenceUris: evidence
          .filter((e) => e.state === 'attached')
          .map((e) => e.uri),
      });
      onCreated(ticket.id);
    } catch {
      show("Couldn't open the case — check your connection and try again.", 'error');
      setSubmitting(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div>
        <label
          htmlFor="ticket-topic"
          className="text-label text-text-muted"
        >
          Topic
        </label>
        <div className="relative mt-1.5">
          <select
            id="ticket-topic"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value as SupportTopicId | '')}
            className={`${FIELD_CLASS} h-11 appearance-none pr-9`}
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {SUPPORT_TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <Icon
            name="chevronDown"
            size={16}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="ticket-order"
          className="text-label text-text-muted"
        >
          Order {isLive ? null : <span className="normal-case text-text-muted">(optional)</span>}
        </label>
        <div className="relative mt-1.5">
          <select
            id="ticket-order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            disabled={ordersLoading || ordersEmpty}
            className={`${FIELD_CLASS} tnum h-11 appearance-none pr-9 disabled:opacity-60`}
          >
            <option value="" disabled={isLive}>
              {ordersLoading
                ? 'Loading your orders…'
                : ordersEmpty
                  ? 'No orders on your account'
                  : isLive
                    ? 'Choose the order this is about'
                    : 'No order — general question'}
            </option>
            {orderOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon
            name="chevronDown"
            size={16}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
        </div>
        {ordersEmpty ? (
          <p className="mt-1.5 text-caption text-text-muted">
            Support requests are tied to an order. If your question is about
            something else, reach out from the order or listing itself.
          </p>
        ) : touched && isLive && orderId === '' ? (
          <p className="mt-1.5 text-caption text-danger-text">
            Pick the order this request is about.
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="ticket-message"
          className="text-label text-text-muted"
        >
          Message
        </label>
        <textarea
          id="ticket-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="What happened? Include what you'd like us to do."
          aria-label="Describe your issue"
          className={`mt-1.5 min-h-[96px] resize-y py-3 ${FIELD_CLASS}`}
        />
        {touched && message.trim().length < 10 ? (
          <p className="mt-1.5 text-caption text-danger-text">
            Give us a sentence or two — at least 10 characters.
          </p>
        ) : null}
      </div>

      {/* Evidence photos — optional, once a topic is chosen. Native
          OrderSupportScreen parity: up to 3, uploaded on pick in live
          mode so the ticket carries durable media URLs. */}
      {topicId !== '' ? (
        <EvidencePhotoField
          label="Photos (optional)"
          hint="Photos of the item, packaging or delivery help us resolve this faster."
          items={evidence}
          onChange={setEvidence}
        />
      ) : null}

      {topic ? (
        <p className="flex items-center gap-1.5 text-caption text-text-muted">
          <Icon name="info" size={14} className="shrink-0" />
          {topic.outcome}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={!canSubmit}>
          {submitting ? 'Opening…' : 'Open case'}
        </Button>
        <Button type="button" variant="quiet" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
