'use client';

/**
 * ListingQA — public questions & answers on the PDP.
 * Port of the mobile ListingQA semantics: ask composer at the top, threads
 * below with seller answers marked by a success accent, "awaiting seller
 * response" honesty for unanswered questions, and an inline answer composer
 * when the viewer owns the listing.
 *
 * Live mode is real persistence: reads come from GET /listings/:id/questions
 * and writes from POST — a question that fails server-side (moderation,
 * auth, offline) surfaces an error, never a fake "posted" state. Held-for-
 * review rows render with their quarantine marker, author-visible only —
 * the same predicate the backend applies. Fixture mode keeps LISTING_QA as
 * session-local truth so design mode can still demonstrate the flow.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { parseApiError } from '@/lib/api/http';
import { DATA_MODE } from '@/lib/api/client';
import * as listingsService from '@/lib/api/services/listings';
import {
  useAnswerListingQuestion,
  useListingQuestions,
  usePostListingQuestion,
} from '@/lib/hooks/pdp-queries';
import { timeAgo } from '@/lib/utils/format';

interface ListingQAProps {
  listing: Listing;
  /** Viewer blocked this seller — the ask composer is suppressed and the
   *  relationship stated plainly (mobile ListingQA parity, S20-06). */
  isSellerBlocked?: boolean;
}

export function ListingQA({ listing, isSellerBlocked = false }: ListingQAProps) {
  const router = useRouter();
  const { show } = useToast();
  const { user, isGuest } = useSession();
  const queryClient = useQueryClient();

  const questionsQuery = useListingQuestions(listing.id);
  const questions = questionsQuery.data ?? [];
  const postQuestion = usePostListingQuestion(listing.id);
  const answerQuestion = useAnswerListingQuestion(listing.id);

  /**
   * Q&A summary — GET /listings/:id/qa-summary, the aggregate read native
   * uses for its "View all questions" affordance. It gives the server-
   * authoritative public count (the threads payload can lag or page) and
   * the answered-count. Live-only: the extra lines hide in fixture mode
   * rather than fabricating; a failed read just falls back to the loaded
   * list length — the threads below remain the visible truth.
   */
  const liveMode = DATA_MODE === 'live';
  const summaryQuery = useQuery({
    queryKey: ['listing-qa-summary', listing.id],
    enabled: liveMode,
    staleTime: 30_000,
    retry: 1,
    queryFn: ({ signal }) => listingsService.fetchListingQaSummary(listing.id, signal),
  });
  const qaSummary = summaryQuery.data ?? null;

  const [askText, setAskText] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');

  const isSeller = user?.id === listing.sellerId;

  // The server count wins in live mode — it covers every publicly-visible
  // question, not just the rows this page loaded.
  const questionTotal =
    liveMode && qaSummary ? qaSummary.questionCount : questions.length;
  const answeredTotal = qaSummary?.answeredQuestionCount ?? 0;

  // Native parity: the whole section self-omits when nothing can render.
  // For the seller viewing their own listing there is no ask composer and,
  // once the server reports zero public questions, no archive either.
  if (isSeller && liveMode && qaSummary && qaSummary.questionCount === 0) {
    return null;
  }

  const handleAsk = () => {
    const trimmed = askText.trim();
    if (!trimmed) return;
    if (isGuest) {
      router.push('/auth');
      return;
    }
    // Same bounds as the backend schema (min 5, max 300) — client-side so
    // the error lands before the wire, not after a 400.
    if (trimmed.length < 5) {
      show('Question must be at least 5 characters', 'error');
      return;
    }
    postQuestion.mutate(trimmed, {
      onSuccess: (question) => {
        setAskText('');
        void queryClient.invalidateQueries({
          queryKey: ['listing-qa-summary', listing.id],
        });
        show(
          question.moderationState === 'pending_review'
            ? 'Question sent — it appears once review clears'
            : 'Question posted',
          'success',
        );
      },
      onError: (error) => {
        show(
          parseApiError(error, 'Could not post the question — try again.').message,
          'error',
        );
      },
    });
  };

  const handleAnswer = (questionId: string) => {
    const trimmed = answerText.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) {
      show('Answer must be at least 3 characters', 'error');
      return;
    }
    answerQuestion.mutate(
      { questionId, text: trimmed },
      {
        onSuccess: ({ answer }) => {
          setAnswerText('');
          setAnsweringId(null);
          void queryClient.invalidateQueries({
            queryKey: ['listing-qa-summary', listing.id],
          });
          show(
            answer.moderationState === 'pending_review'
              ? 'Answer sent — it appears once review clears'
              : 'Answer posted',
            'success',
          );
        },
        onError: (error) => {
          show(
            parseApiError(error, 'Could not post the answer — try again.').message,
            'error',
          );
        },
      },
    );
  };

  return (
    <section
      className="border-t border-border-subtle py-6"
      aria-labelledby="pdp-questions"
    >
      {/* Section header — title + quiet count */}
      <div className="mb-4 flex items-center gap-2">
        <h2
          id="pdp-questions"
          className="flex-1 text-section-title font-semibold text-text-primary"
        >
          Questions &amp; answers
        </h2>
        {questionTotal > 0 ? (
          <span className="tnum rounded-full bg-surface-alt px-2 py-0.5 text-meta text-text-muted">
            {questionTotal}
          </span>
        ) : null}
        {answeredTotal > 0 ? (
          <span className="text-meta text-text-muted">
            {answeredTotal} answered
          </span>
        ) : null}
      </div>

      {/* Ask composer — buyers only (the backend 403s the seller asking on
          their own listing); guests route through auth on submit. A
          blocked seller's public Q&A stays readable, but the submission
          affordance is gated with the relationship stated plainly. */}
      {isSellerBlocked ? (
        <p className="mb-4 flex items-center gap-2 text-caption text-text-muted">
          <Icon name="ban" size={16} className="shrink-0" />
          You blocked this seller — unblock them to ask a question.
        </p>
      ) : !isSeller ? (
        <form
          className="mb-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
        >
          <textarea
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            rows={1}
            maxLength={300}
            placeholder="Ask a question about this item…"
            aria-label="Ask a question"
            className="max-h-28 min-h-11 flex-1 resize-none rounded-md bg-surface-alt px-3.5 py-2.5 text-body text-input-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border"
          />
          <button
            type="submit"
            disabled={!askText.trim() || postQuestion.isPending}
            aria-label="Post question"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand text-text-inverse disabled:pointer-events-none disabled:bg-surface-alt disabled:text-text-muted"
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      ) : null}

      {/* Threads — hairline-separated, answers carry a success accent */}
      {questionsQuery.isPending ? (
        <div className="flex flex-col gap-5 py-2" aria-busy aria-label="Loading questions">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ))}
        </div>
      ) : questionsQuery.isError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-body text-text-secondary">
            {parseApiError(questionsQuery.error, 'Questions could not be loaded.').message}
          </p>
          <button
            type="button"
            onClick={() => void questionsQuery.refetch()}
            className="pressable rounded-md px-3 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Try again
          </button>
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6">
          <Icon name="chat" size={28} className="text-text-muted" />
          <p className="text-body text-text-muted">No questions yet</p>
          <p className="text-meta text-text-muted">
            {isSeller
              ? 'Buyer questions land here — answer them inline'
              : isSellerBlocked
                ? 'Questions and seller answers appear here'
                : 'Be the first to ask the seller about this item'}
          </p>
        </div>
      ) : (
        <div>
          {questions.map((q) => (
            <article
              key={q.id}
              className="border-b border-border-subtle pb-5 pt-5 first:pt-0 last:border-0 last:pb-0"
              aria-label={`Question from ${q.askerName}`}
            >
              <div className="mb-1.5 flex items-center gap-2.5">
                <Avatar src={q.askerAvatar} name={q.askerName} size={28} />
                <div className="min-w-0">
                  <p className="clamp-1 text-caption font-medium text-text-primary">
                    {q.askerName}
                  </p>
                  {q.createdAt ? (
                    <p className="text-meta text-text-muted">{timeAgo(q.createdAt)}</p>
                  ) : null}
                </div>
              </div>
              <p className="text-body leading-relaxed text-text-primary">{q.text}</p>
              {/* Quarantined rows are author-visible only — label the hold
                  instead of implying the question is public. */}
              {q.moderationState === 'pending_review' ? (
                <p className="mt-1.5 text-meta font-medium text-text-muted">
                  Under review — only you can see this for now
                </p>
              ) : null}

              {q.answer ? (
                <div className="ml-3 mt-3 border-l-2 border-success pl-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Icon name="verified" size={12} className="shrink-0 text-commerce-trust" />
                    <p className="flex-1 text-meta font-medium text-success-text">
                      Seller{q.answer.responderName ? ` · ${q.answer.responderName}` : ''}
                    </p>
                    {q.answer.createdAt ? (
                      <p className="text-meta text-text-muted">
                        {timeAgo(q.answer.createdAt)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-caption leading-relaxed text-text-secondary">
                    {q.answer.text}
                  </p>
                  {q.answer.moderationState === 'pending_review' ? (
                    <p className="mt-1.5 text-meta font-medium text-text-muted">
                      Under review — only you can see this for now
                    </p>
                  ) : null}
                </div>
              ) : isSeller ? (
                answeringId === q.id ? (
                  <div className="mt-3">
                    <textarea
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      rows={2}
                      maxLength={500}
                      autoFocus
                      placeholder="Type your answer…"
                      aria-label="Type your answer"
                      className="w-full resize-none rounded-md bg-surface-alt px-3.5 py-2.5 text-body text-input-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border"
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAnsweringId(null);
                          setAnswerText('');
                        }}
                        className="pressable rounded-md px-3 py-1.5 text-caption font-medium text-text-secondary hover:text-text-primary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!answerText.trim() || answerQuestion.isPending}
                        onClick={() => handleAnswer(q.id)}
                        className="pressable rounded-md bg-brand px-3.5 py-1.5 text-caption font-semibold text-text-inverse disabled:pointer-events-none disabled:opacity-40"
                      >
                        {answerQuestion.isPending ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAnsweringId(q.id)}
                    className="pressable mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-subtle px-3 py-1.5 text-caption font-semibold text-text-primary"
                  >
                    Answer
                  </button>
                )
              ) : (
                <p className="mt-2 text-meta text-text-muted">
                  Awaiting seller response
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
