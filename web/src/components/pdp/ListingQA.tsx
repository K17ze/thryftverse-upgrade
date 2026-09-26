'use client';

/**
 * ListingQA — public questions & answers on the PDP.
 * Port of the mobile ListingQA semantics: ask composer at the top, threads
 * below with seller answers marked by a success accent, "awaiting seller
 * response" honesty for unanswered questions, and an inline answer composer
 * when the viewer owns the listing. Questions persist for the session in
 * local state — design-mode counterpart of POST /listings/:id/questions.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Listing, ListingQuestion } from '@/lib/contracts/domain';
import { LISTING_QA } from '@/lib/data/fixtures';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { timeAgo } from '@/lib/utils/format';

interface ListingQAProps {
  listing: Listing;
}

export function ListingQA({ listing }: ListingQAProps) {
  const router = useRouter();
  const { show } = useToast();
  const { user, isGuest } = useSession();

  const [questions, setQuestions] = useState<ListingQuestion[]>(
    () => LISTING_QA.filter((q) => q.listingId === listing.id),
  );
  const [askText, setAskText] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');

  const isSeller = user?.id === listing.sellerId;

  const handleAsk = () => {
    const trimmed = askText.trim();
    if (!trimmed) return;
    if (trimmed.length < 5) {
      show('Question must be at least 5 characters', 'error');
      return;
    }
    if (isGuest) {
      router.push('/auth');
      return;
    }
    setQuestions((prev) => [
      {
        id: `q-local-${Date.now()}`,
        listingId: listing.id,
        askerId: user?.id,
        askerName: user?.username ?? 'You',
        askerAvatar: user?.avatar,
        text: trimmed,
        createdAt: new Date().toISOString(),
        answer: null,
      },
      ...prev,
    ]);
    setAskText('');
    show('Question posted', 'success');
  };

  const handleAnswer = (questionId: string) => {
    const trimmed = answerText.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) {
      show('Answer must be at least 3 characters', 'error');
      return;
    }
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              answer: {
                text: trimmed,
                responderName: user?.username ?? 'Seller',
                createdAt: new Date().toISOString(),
              },
            }
          : q,
      ),
    );
    setAnswerText('');
    setAnsweringId(null);
    show('Answer posted', 'success');
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
        {questions.length > 0 ? (
          <span className="tnum rounded-full bg-surface-alt px-2 py-0.5 text-meta text-text-muted">
            {questions.length}
          </span>
        ) : null}
      </div>

      {/* Ask composer — submit gated on auth like the rest of the PDP */}
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
          className="max-h-28 min-h-[42px] flex-1 resize-none rounded-md bg-surface-alt px-3.5 py-2.5 text-body text-input-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-border"
        />
        <button
          type="submit"
          disabled={!askText.trim()}
          aria-label="Post question"
          className="pressable flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-md bg-brand text-text-inverse disabled:pointer-events-none disabled:bg-surface-alt disabled:text-text-muted"
        >
          <Icon name="send" size={16} />
        </button>
      </form>

      {/* Threads — hairline-separated, answers carry a success accent */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6">
          <Icon name="chat" size={28} className="text-text-muted" />
          <p className="text-body text-text-muted">No questions yet</p>
          <p className="text-meta text-text-muted">
            Be the first to ask the seller about this item
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

              {q.answer ? (
                <div className="ml-3 mt-3 border-l-2 border-success pl-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <Icon name="verified" size={12} className="shrink-0 text-success-text" />
                    <p className="flex-1 text-meta font-medium text-success-text">
                      Seller · {q.answer.responderName}
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
                        disabled={!answerText.trim()}
                        onClick={() => handleAnswer(q.id)}
                        className="pressable rounded-md bg-brand px-3.5 py-1.5 text-caption font-semibold text-text-inverse disabled:pointer-events-none disabled:opacity-40"
                      >
                        Post
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
