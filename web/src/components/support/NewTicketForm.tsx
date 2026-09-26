'use client';

/**
 * NewTicketForm — the contact CTA's inline form: topic select, optional
 * order reference, message. Creates the case in session state and hands
 * the caller the new ticket for navigation. Outcome preview per topic
 * mirrors OrderSupportScreen's honest expectation-setting.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  SUPPORT_TOPICS,
  topicById,
  type SupportTopicId,
} from '@/lib/contracts/support';
import { useSupportActions } from './useSupportTickets';

const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none';

interface NewTicketFormProps {
  onCreated: (ticketId: string) => void;
  onCancel: () => void;
}

export function NewTicketForm({ onCreated, onCancel }: NewTicketFormProps) {
  const { createTicket } = useSupportActions();
  const [topicId, setTopicId] = useState<SupportTopicId | ''>('');
  const [orderRef, setOrderRef] = useState('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);

  const topic = topicId ? topicById(topicId) : undefined;
  const canSubmit = topicId !== '' && message.trim().length >= 10;

  const submit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    const ticket = await createTicket({
      topicId,
      orderRef: orderRef.trim() || null,
      message: message.trim(),
    });
    onCreated(ticket.id);
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
          className="text-label font-semibold uppercase tracking-wider text-text-muted"
        >
          Topic
        </label>
        <div className="relative mt-1.5">
          <select
            id="ticket-topic"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value as SupportTopicId | '')}
            className={`${FIELD_CLASS} appearance-none pr-9`}
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
          className="text-label font-semibold uppercase tracking-wider text-text-muted"
        >
          Order reference <span className="normal-case text-text-muted">(optional)</span>
        </label>
        <input
          id="ticket-order"
          type="text"
          value={orderRef}
          onChange={(e) => setOrderRef(e.target.value)}
          placeholder="e.g. ord-1042"
          className={`tnum mt-1.5 ${FIELD_CLASS}`}
        />
      </div>

      <div>
        <label
          htmlFor="ticket-message"
          className="text-label font-semibold uppercase tracking-wider text-text-muted"
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

      {topic ? (
        <p className="flex items-center gap-1.5 text-caption text-text-muted">
          <Icon name="info" size={14} className="shrink-0" />
          {topic.outcome}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="lg" fullWidth disabled={!canSubmit}>
          Open case
        </Button>
        <Button type="button" variant="quiet" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
