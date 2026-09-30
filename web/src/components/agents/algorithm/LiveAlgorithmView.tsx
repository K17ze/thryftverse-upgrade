'use client';

import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { parseApiError } from '@/lib/api/http';
import type { AlgorithmIntentTopic } from '@/lib/api/services/agents';
import { AgentsSignInWall } from '../AgentsGate';
import { PageHeader, WeightControl, bandToWeight } from './AlgorithmPrimitives';
import { useLiveAlgorithmWorkflow } from './useLiveAlgorithmWorkflow';
import type { TopicWeight } from '../useAlgorithmPrefs';

function LiveTopicRow({
  topic,
  pending,
  onWeight,
  onRemove,
}: {
  topic: AlgorithmIntentTopic;
  pending: boolean;
  onWeight: (weight: TopicWeight) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex min-h-[56px] items-center gap-3 px-4 py-2 sm:px-6">
      <span className="flex h-8 w-6 shrink-0 items-center text-text-muted">
        <Icon name={topic.removable ? 'heart' : 'lock'} size={15} />
      </span>
      <span className="clamp-1 min-w-0 flex-1 text-body text-text-primary">
        {topic.label}
        {!topic.removable ? (
          <span className="ml-2 text-meta text-text-muted">from your activity</span>
        ) : null}
      </span>
      <WeightControl
        value={bandToWeight(topic.influenceBand)}
        onChange={onWeight}
        aria-label={`Weight for ${topic.label}`}
      />
      {topic.removable ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          aria-label={`Remove ${topic.label}`}
          className="pressable flex h-9 w-9 shrink-0 items-center justify-center text-text-muted hover:text-danger-text disabled:opacity-40"
        >
          <Icon name="close" size={15} />
        </button>
      ) : (
        <span className="w-9 shrink-0" />
      )}
    </li>
  );
}

export function LiveAlgorithmView() {
  const w = useLiveAlgorithmWorkflow();

  return (
    <div className="pb-16">
      <PageHeader
        subtitle={
          w.access === 'ok' && w.profile
            ? w.tunedCount > 0
              ? `${w.tunedCount} tuned away from usual.`
              : 'Mostly untuned — a normal feed.'
            : undefined
        }
      />

      {w.access === 'loading' || (w.access === 'ok' && w.isLoading) ? (
        <div aria-busy aria-label="Loading your signals" className="mt-8 space-y-px">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[56px] w-full rounded-none" />
          ))}
        </div>
      ) : w.access === 'blocked' ? (
        <AgentsSignInWall title="Sign in to tune your algorithm" />
      ) : w.isError || !w.profile ? (
        <div className="mt-8">
          <EmptyState
            icon="trending"
            title="Couldn't load your algorithm"
            subtitle={parseApiError(
              w.error,
              'Your feed signals could not be reached. Try again.',
            ).message}
            actionLabel="Try again"
            onAction={() => void w.refetch()}
          />
        </div>
      ) : (
        <>
          {w.profile.profileMode === 'non_profiled' ? (
            <div className="mx-4 mt-5 flex items-start gap-2.5 rounded-lg bg-surface-alt px-3.5 py-3 sm:mx-6 lg:max-w-[720px]">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-text-secondary" />
              <p className="text-meta leading-relaxed text-text-secondary">
                Personalised recommendations are off on your account — these
                signals aren’t shaping your feed right now.
              </p>
            </div>
          ) : null}

          {/* Add — the inline add row, same grammar as native */}
          <div className="mt-6 px-4 sm:px-6">
            <div className="flex gap-2 lg:max-w-[440px]">
              <input
                type="text"
                value={w.query}
                onChange={(e) => w.setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') w.addTopic(w.query);
                }}
                placeholder="Add an interest"
                maxLength={40}
                aria-label="Add an interest"
                className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
              />
              <button
                type="button"
                onClick={() => w.addTopic(w.query)}
                disabled={!w.query.trim() || w.existing.has(w.query.trim().toLowerCase()) || w.busyKey !== null}
                aria-label="Add"
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-text-primary disabled:opacity-40"
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            {w.quickPicks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {w.quickPicks.map((s) => (
                  <Chip key={s} onClick={() => w.addTopic(s)}>
                    {s}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>

          {/* Signals — removable user topics first, then the
              history-derived rows the server marks non-removable. */}
          <section aria-label="Interests" className="mt-8">
            <h2 className="px-4 text-label text-text-muted sm:px-6">Interests</h2>
            {w.removableTopics.length > 0 ? (
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {w.removableTopics.map((topic) => (
                  <LiveTopicRow
                    key={topic.id}
                    topic={topic}
                    pending={w.busyKey === topic.id}
                    onWeight={(weight) => w.updateTopicWeight(topic.id, topic.label, weight)}
                    onRemove={() => w.removeTopic(topic.id, topic.label)}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-y border-border-subtle px-4 py-6 text-center text-body text-text-muted sm:px-6">
                No interests yet — add one above and the feed listens.
              </p>
            )}
          </section>

          {w.derivedTopics.length > 0 ? (
            <section aria-label="From your activity" className="mt-10">
              <h2 className="px-4 text-label text-text-muted sm:px-6">
                From your activity
              </h2>
              <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
                Signals the server derived from what you browse and buy — you
                can tune them, but they can’t be removed.
              </p>
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {w.derivedTopics.map((topic) => (
                  <LiveTopicRow
                    key={topic.id}
                    topic={topic}
                    pending={w.busyKey === topic.id}
                    onWeight={(weight) => w.updateTopicWeight(topic.id, topic.label, weight)}
                    onRemove={() => undefined}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {/* Reset — the real POST /reset wire, destructive and honest. */}
          <div className="mt-10 border-y border-border-subtle px-4 py-4 sm:px-6">
            <p className="text-body-emphasis font-medium text-text-primary">
              Reset your signals
            </p>
            <p className="mt-1 text-caption text-text-secondary">
              Clears every topic — the feed starts listening fresh.
            </p>
            <button
              type="button"
              onClick={() => void w.onReset()}
              disabled={w.resetting}
              className="pressable mt-3 text-body-emphasis font-semibold text-danger-text disabled:opacity-50"
            >
              {w.resetting ? 'Resetting…' : 'Reset all signals'}
            </button>
          </div>
        </>
      )}

      <p className="px-4 pb-4 pt-8 text-center text-meta text-text-muted sm:px-6">
        Recommendations are signals, not promises — a high weight favours, it
        never guarantees.
      </p>
    </div>
  );
}
