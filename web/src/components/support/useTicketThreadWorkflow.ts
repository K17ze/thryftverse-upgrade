'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import {
  canRequestHandoff,
  caseRefLabel,
  contextLinksFor,
  operationalStateLabel,
  ownershipLabel,
  statusMeta,
} from '@/lib/contracts/support';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useSupportActions,
  useSupportCaseDetail,
  useSupportTickets,
} from './useSupportTickets';

const PAGE_SIZE = 12;

export function useTicketThreadWorkflow(ticketId: string) {
  const router = useRouter();
  const { show } = useToast();
  const { isGuest, sessionLoading } = useSession();
  const { data: tickets, isLoading, isError, refetch } = useSupportTickets();
  const detail = useSupportCaseDetail(ticketId);
  const {
    appendMessage,
    retryMessage,
    acceptResolution,
    requestHandoff,
    contestResolution,
    submitCsat,
  } = useSupportActions();

  const [draft, setDraft] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [contesting, setContesting] = useState(false);
  const [contestReason, setContestReason] = useState('');
  const [contestBusy, setContestBusy] = useState(false);

  const ticket = useMemo(
    () => (tickets ?? []).find((t) => t.id === ticketId) ?? null,
    [tickets, ticketId],
  );

  const meta = ticket ? statusMeta(ticket.status) : null;
  const stateLabel = ticket
    ? ticket.operationalState
      ? operationalStateLabel(ticket.operationalState)
      : meta?.label ?? ''
    : '';

  const closed = ticket?.status === 'closed';
  const hasCaseApi = DATA_MODE !== 'live' || (ticket ? !ticket.id.startsWith('ticket_') : false);
  const canReply = !closed && hasCaseApi;
  const resolutionOpen = ticket?.status === 'resolved' && ticket?.resolution !== null;
  const owner = ticket ? ownershipLabel(ticket) : null;
  const handoffOffered = ticket ? canRequestHandoff(ticket) && hasCaseApi : false;
  const csatAvailable =
    DATA_MODE !== 'live' || (hasCaseApi && !!ticket?.conversationId);

  const contextLinks = ticket ? contextLinksFor(ticket) : [];
  const evidence = ticket?.evidence ?? [];
  const activityEvents = (ticket?.events ?? []).filter(
    (e) => e.kind === 'note' || e.kind === 'evidence' || e.kind === 'handoff' || e.kind === 'closed',
  );

  const messages = ticket?.messages ?? [];
  const hiddenCount = Math.max(0, messages.length - shown);
  const visibleMessages = messages.slice(-shown);

  const loadEarlier = () => {
    setShown((n) => n + PAGE_SIZE);
  };

  const send = () => {
    const body = draft.trim();
    if (!body || !canReply || !ticket) return;
    appendMessage(ticket.id, body);
    setDraft('');
  };

  const handleRetry = (messageId: string) => {
    if (!ticket) return;
    retryMessage(ticket.id, messageId);
  };

  const handleHandoff = () => {
    if (!ticket) return;
    requestHandoff(ticket.id);
    show('Specialist requested — they reply in this thread.', 'success');
  };

  const handleAccept = () => {
    if (!ticket) return;
    acceptResolution(ticket.id);
    show('Resolution accepted — case closed.', 'success');
  };

  const submitContest = async () => {
    if (!ticket) return;
    setContestBusy(true);
    const ok = await contestResolution(ticket.id, contestReason);
    setContestBusy(false);
    if (ok) {
      setContesting(false);
      setContestReason('');
      show('A specialist will review the decision.', 'success');
    } else {
      show('Could not send the appeal — try again.', 'error');
    }
  };

  const handleCsat = async (rating: 'helpful' | 'unhelpful', note: string) => {
    if (!ticket) return;
    const ok = await submitCsat(ticket.id, rating, note);
    show(
      ok ? 'Thanks — feedback recorded.' : 'Could not send feedback — try again.',
      ok ? 'success' : 'error',
    );
  };

  const handleRetryLoad = () => {
    void refetch();
    void detail.refetch();
  };

  return {
    router,
    isGuest,
    sessionLoading,
    isLoading,
    isError,
    detail,
    ticket,
    meta,
    stateLabel,
    closed,
    hasCaseApi,
    canReply,
    resolutionOpen,
    owner,
    handoffOffered,
    csatAvailable,
    contextLinks,
    evidence,
    activityEvents,
    hiddenCount,
    visibleMessages,
    draft,
    setDraft,
    contesting,
    setContesting,
    contestReason,
    setContestReason,
    contestBusy,
    loadEarlier,
    send,
    handleRetry,
    handleHandoff,
    handleAccept,
    submitContest,
    handleCsat,
    handleRetryLoad,
    caseRef: ticket ? caseRefLabel(ticket.ref) : '',
  };
}

export type TicketThreadWorkflow = ReturnType<typeof useTicketThreadWorkflow>;
