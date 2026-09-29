'use client';

/**
 * AlgorithmView — /agents/algorithm ("Your algorithm").
 *
 * Live mode is wired to the real intent profile
 * (GET /recommendations/intent/:userId/profile + POST .../mutate — the same
 * contract the native YourAlgorithmScreen consumes): topics carry a
 * server-side influence band, and rows the server marks non-removable
 * (history-derived) show the lock affordance — "from your activity" is now
 * a true claim. When the backend can't answer, the page shows the honest
 * unavailable state; it never renders seed topics as the user's signals.
 *
 * Fixture mode keeps the authored device-local preferences (persisted
 * zustand slice), labelled "Saved on this device".
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  fetchAlgorithmIntentProfile,
  mutateAlgorithmIntent,
  resetAlgorithmIntent,
  type AlgorithmIntentProfile,
  type AlgorithmIntentTopic,
} from '@/lib/api/services/agents';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { AgentsSignInWall, useAgentsAccess } from './AgentsGate';
import {
  discoveryLabel,
  priceComfortLabel,
  useAlgorithmPrefs,
  type AlgoTopic,
  type TopicWeight,
} from './useAlgorithmPrefs';

const SUGGESTED_TOPICS = [
  'Vintage denim',
  'Sneakers',
  'Streetwear',
  'Minimalist style',
  'Tailored outerwear',
  'Vintage watches',
  'Workwear',
  'Leather goods',
  'Knitwear',
  'Archive fashion',
  'Knit vests',
  'Sustainability',
] as const;

const SUGGESTED_BRANDS = [
  'Carhartt WIP',
  'Barbour',
  'Levi\u2019s',
  'Patagonia',
  'Ralph Lauren',
  'Nike',
  'Dr. Martens',
  'Stone Island',
] as const;

const WEIGHTS: Array<{ value: TopicWeight; label: string }> = [
  { value: 'low', label: 'Less' },
  { value: 'medium', label: 'Usual' },
  { value: 'high', label: 'More' },
];

/** Less / Usual / More — the weight grammar, inline on the row. */
function WeightControl({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: TopicWeight;
  onChange: (w: TopicWeight) => void;
  'aria-label': string;
}) {
  return (
    <div
      className="flex shrink-0 items-center rounded-full border border-border-subtle"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {WEIGHTS.map((w) => {
        const selected = w.value === value;
        return (
          <button
            key={w.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(w.value)}
            className={`pressable h-8 rounded-full px-3 text-meta font-medium ${
              selected ? 'bg-brand text-text-inverse' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

function PageHeader({ subtitle }: { subtitle?: string }) {
  const router = useRouter();
  return (
    <>
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
        <h1 className="flex-1 text-screen-title text-text-primary">
          Your algorithm
        </h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        The signals that shape your home feed and Discover.{subtitle ? ` ${subtitle}` : ''}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Live — the real recommendation-intent wire.
// ---------------------------------------------------------------------------

/** Wire band → row weight. 'more' → high, 'usual' → medium, 'less' and
 *  'excluded' → low (the row grammar has no exclude option — 'excluded'
 *  displays as its nearest honest neighbour rather than as 'usual'). */
function bandToWeight(band: string): TopicWeight {
  if (band === 'more') return 'high';
  if (band === 'less' || band === 'excluded') return 'low';
  return 'medium';
}

function weightToDirection(weight: TopicWeight): 'more' | 'usual' | 'less' {
  if (weight === 'high') return 'more';
  if (weight === 'low') return 'less';
  return 'usual';
}

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

function LiveAlgorithmView() {
  const { show } = useToast();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const profileKey = ['algorithm-intent', userId ?? ''] as const;
  const { data: profile, isLoading, isError, error, refetch } = useQuery({
    queryKey: profileKey,
    enabled: !!userId,
    queryFn: ({ signal }) => fetchAlgorithmIntentProfile(userId as string, signal),
  });
  const access = useAgentsAccess(error);

  const topics = useMemo(() => profile?.topics ?? [], [profile]);
  const tunedCount = useMemo(
    () =>
      topics.filter((t) => t.influenceBand === 'more' || t.influenceBand === 'less').length,
    [topics],
  );

  const existing = useMemo(
    () => new Set(topics.map((t) => t.label.toLowerCase())),
    [topics],
  );
  const quickPicks = useMemo(
    () => SUGGESTED_TOPICS.filter((s) => !existing.has(s.toLowerCase())).slice(0, 6),
    [existing],
  );

  const applyMutation = async (
    pendingKey: string,
    input: {
      idempotencyKey: string;
      targetId: string;
      targetLabel: string;
      direction: 'more' | 'usual' | 'less' | 'add' | 'remove';
      topicCategory?: string;
    },
    optimistic?: (prev: AlgorithmIntentProfile) => AlgorithmIntentProfile,
  ) => {
    if (!userId || busyKey) return;
    setBusyKey(pendingKey);
    const prev = queryClient.getQueryData<AlgorithmIntentProfile>(profileKey);
    if (prev && optimistic) queryClient.setQueryData(profileKey, optimistic(prev));
    try {
      await mutateAlgorithmIntent(userId, input);
      await queryClient.invalidateQueries({ queryKey: profileKey });
    } catch (err) {
      if (prev) queryClient.setQueryData(profileKey, prev);
      show(parseApiError(err, 'Couldn’t update your algorithm').message, 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const addTopic = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || existing.has(trimmed.toLowerCase())) return;
    const targetId = `topic-user-${Date.now()}`;
    void applyMutation(
      `add-${targetId}`,
      {
        idempotencyKey: `add-${targetId}`,
        targetId,
        targetLabel: trimmed,
        direction: 'add',
        topicCategory: 'Category preference',
      },
      (prev) => ({
        ...prev,
        topics: [
          {
            id: targetId,
            label: trimmed,
            category: 'Category preference',
            influenceBand: 'usual',
            sourceType: 'explicit',
            evidenceCount: 0,
            removable: true,
            paused: false,
            lastEvidenceAt: null,
            updatedAt: new Date().toISOString(),
          },
          ...prev.topics,
        ],
      }),
    );
    setQuery('');
  };

  const onReset = async () => {
    if (!userId || resetting) return;
    setResetting(true);
    try {
      await resetAlgorithmIntent(userId);
      await queryClient.invalidateQueries({ queryKey: profileKey });
      show('Your algorithm was reset', 'info');
    } catch (err) {
      show(parseApiError(err, 'Couldn’t reset your algorithm').message, 'error');
    } finally {
      setResetting(false);
    }
  };

  const removableTopics = topics.filter((t) => t.removable);
  const derivedTopics = topics.filter((t) => !t.removable);

  return (
    <div className="pb-16">
      <PageHeader
        subtitle={
          access === 'ok' && profile
            ? tunedCount > 0
              ? `${tunedCount} tuned away from usual.`
              : 'Mostly untuned — a normal feed.'
            : undefined
        }
      />

      {access === 'loading' || (access === 'ok' && isLoading) ? (
        <div aria-busy aria-label="Loading your signals" className="mt-8 space-y-px">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[56px] w-full rounded-none" />
          ))}
        </div>
      ) : access === 'blocked' ? (
        <AgentsSignInWall title="Sign in to tune your algorithm" />
      ) : isError || !profile ? (
        <div className="mt-8">
          <EmptyState
            icon="trending"
            title="Couldn't load your algorithm"
            subtitle={parseApiError(
              error,
              'Your feed signals could not be reached. Try again.',
            ).message}
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        </div>
      ) : (
        <>
          {profile.profileMode === 'non_profiled' ? (
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addTopic(query);
                }}
                placeholder="Add an interest"
                maxLength={40}
                aria-label="Add an interest"
                className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
              />
              <button
                type="button"
                onClick={() => addTopic(query)}
                disabled={!query.trim() || existing.has(query.trim().toLowerCase()) || busyKey !== null}
                aria-label="Add"
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-text-primary disabled:opacity-40"
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            {quickPicks.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {quickPicks.map((s) => (
                  <Chip key={s} onClick={() => addTopic(s)}>
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
            {removableTopics.length > 0 ? (
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {removableTopics.map((topic) => (
                  <LiveTopicRow
                    key={topic.id}
                    topic={topic}
                    pending={busyKey === topic.id}
                    onWeight={(w) =>
                      void applyMutation(
                        topic.id,
                        {
                          idempotencyKey: `weight-${topic.id}-${w}`,
                          targetId: topic.id,
                          targetLabel: topic.label,
                          direction: weightToDirection(w),
                        },
                        (prev) => ({
                          ...prev,
                          topics: prev.topics.map((t) =>
                            t.id === topic.id
                              ? { ...t, influenceBand: weightToDirection(w) === 'more' ? 'more' : weightToDirection(w) === 'less' ? 'less' : 'usual' }
                              : t,
                          ),
                        }),
                      )
                    }
                    onRemove={() =>
                      void applyMutation(
                        topic.id,
                        {
                          idempotencyKey: `remove-${topic.id}-${Date.now()}`,
                          targetId: topic.id,
                          targetLabel: topic.label,
                          direction: 'remove',
                        },
                        (prev) => ({
                          ...prev,
                          topics: prev.topics.filter((t) => t.id !== topic.id),
                        }),
                      )
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-3 border-y border-border-subtle px-4 py-6 text-center text-body text-text-muted sm:px-6">
                No interests yet — add one above and the feed listens.
              </p>
            )}
          </section>

          {derivedTopics.length > 0 ? (
            <section aria-label="From your activity" className="mt-10">
              <h2 className="px-4 text-label text-text-muted sm:px-6">
                From your activity
              </h2>
              <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
                Signals the server derived from what you browse and buy — you
                can tune them, but they can’t be removed.
              </p>
              <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
                {derivedTopics.map((topic) => (
                  <LiveTopicRow
                    key={topic.id}
                    topic={topic}
                    pending={busyKey === topic.id}
                    onWeight={(w) =>
                      void applyMutation(
                        topic.id,
                        {
                          idempotencyKey: `weight-${topic.id}-${w}`,
                          targetId: topic.id,
                          targetLabel: topic.label,
                          direction: weightToDirection(w),
                        },
                        (prev) => ({
                          ...prev,
                          topics: prev.topics.map((t) =>
                            t.id === topic.id
                              ? { ...t, influenceBand: weightToDirection(w) === 'more' ? 'more' : weightToDirection(w) === 'less' ? 'less' : 'usual' }
                              : t,
                          ),
                        }),
                      )
                    }
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
              onClick={() => void onReset()}
              disabled={resetting}
              className="pressable mt-3 text-body-emphasis font-semibold text-danger-text disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Reset all signals'}
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

// ---------------------------------------------------------------------------
// Fixture — the authored device-local preferences (persisted zustand slice).
// ---------------------------------------------------------------------------

function LocalTopicRow({
  topic,
  kind,
}: {
  topic: AlgoTopic;
  kind: 'topics' | 'brands';
}) {
  const setTopicWeight = useAlgorithmPrefs((s) => s.setTopicWeight);
  const removeTopic = useAlgorithmPrefs((s) => s.removeTopic);
  return (
    <li className="flex min-h-[56px] items-center gap-3 px-4 py-2 sm:px-6">
      <span className="flex h-8 w-6 shrink-0 items-center text-text-muted">
        <Icon name={kind === 'brands' ? 'pricetag' : 'heart'} size={15} />
      </span>
      <span className="clamp-1 min-w-0 flex-1 text-body text-text-primary">
        {topic.label}
      </span>
      <WeightControl
        value={topic.weight}
        onChange={(w) => setTopicWeight(kind, topic.id, w)}
        aria-label={`Weight for ${topic.label}`}
      />
      <button
        type="button"
        onClick={() => removeTopic(kind, topic.id)}
        aria-label={`Remove ${topic.label}`}
        className="pressable flex h-9 w-9 shrink-0 items-center justify-center text-text-muted hover:text-danger-text"
      >
        <Icon name="close" size={15} />
      </button>
    </li>
  );
}

function LocalTopicSection({
  title,
  hint,
  kind,
  items,
  suggestions,
  addPlaceholder,
}: {
  title: string;
  hint: string;
  kind: 'topics' | 'brands';
  items: AlgoTopic[];
  suggestions: readonly string[];
  addPlaceholder: string;
}) {
  const addTopic = useAlgorithmPrefs((s) => s.addTopic);
  const [query, setQuery] = useState('');

  const existing = useMemo(
    () => new Set(items.map((t) => t.label.toLowerCase())),
    [items],
  );
  const quickPicks = useMemo(
    () => suggestions.filter((s) => !existing.has(s.toLowerCase())).slice(0, 6),
    [suggestions, existing],
  );

  const submit = () => {
    const label = query.trim();
    if (!label) return;
    addTopic(kind, label);
    setQuery('');
  };

  return (
    <section aria-label={title} className="mt-10">
      <h2 className="px-4 text-label text-text-muted sm:px-6">
        {title}
      </h2>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">{hint}</p>

      {items.length > 0 ? (
        <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
          {items.map((topic) => (
            <LocalTopicRow key={topic.id} topic={topic} kind={kind} />
          ))}
        </ul>
      ) : null}

      {/* Inline add + quick picks — the mobile add-row grammar; desktop
          keeps the input to form width, not full canvas. */}
      <div className="mt-4 px-4 sm:px-6">
        <div className="flex gap-2 lg:max-w-[440px]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={addPlaceholder}
            maxLength={40}
            aria-label={addPlaceholder}
            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!query.trim() || existing.has(query.trim().toLowerCase())}
            aria-label="Add"
            className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-text-primary disabled:opacity-40"
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
        {quickPicks.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {quickPicks.map((s) => (
              <Chip key={s} onClick={() => addTopic(kind, s)}>
                {s}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  startHint,
  endHint,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  startHint?: string;
  endHint?: string;
}) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <p className="text-body-emphasis text-text-primary">{label}</p>
        <p className="tnum text-caption font-medium text-text-secondary">{valueLabel}</p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-3 w-full accent-brand"
      />
      {startHint || endHint ? (
        <div className="flex justify-between text-meta text-text-muted">
          <span>{startHint}</span>
          <span>{endHint}</span>
        </div>
      ) : null}
    </div>
  );
}

function FixtureAlgorithmView() {
  // Persisted store — gate so SSR and the first client render agree.
  const hydrated = useHydrated();
  const topics = useAlgorithmPrefs((s) => s.topics);
  const brands = useAlgorithmPrefs((s) => s.brands);
  const priceComfort = useAlgorithmPrefs((s) => s.priceComfort);
  const discoveryDial = useAlgorithmPrefs((s) => s.discoveryDial);
  const setPriceComfort = useAlgorithmPrefs((s) => s.setPriceComfort);
  const setDiscoveryDial = useAlgorithmPrefs((s) => s.setDiscoveryDial);

  const tunedCount =
    topics.filter((t) => t.weight !== 'medium').length +
    brands.filter((b) => b.weight !== 'medium').length;

  return (
    <div className="pb-16">
      <PageHeader
        subtitle={
          hydrated
            ? tunedCount > 0
              ? `${tunedCount} tuned away from usual.`
              : 'Mostly untuned — a normal feed.'
            : undefined
        }
      />

      {/* Honesty note — device-local in fixture mode, always shown */}
      <div className="mx-4 mt-5 flex items-start gap-2.5 rounded-lg bg-surface-alt px-3.5 py-3 sm:mx-6 lg:max-w-[720px]">
        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-text-secondary" />
        <p className="text-meta leading-relaxed text-text-secondary">
          Saved on this device. These affect your home feed ranking — they
          don&rsquo;t change what sellers list or what other people see.
        </p>
      </div>

      {!hydrated ? (
        <div aria-busy aria-label="Loading your preferences" className="mt-8 space-y-px">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[56px] w-full rounded-none" />
          ))}
        </div>
      ) : (
        <>
      {/* Dials — continuous signals; side-by-side columns at lg. */}
      <section aria-label="Feed dials" className="mt-8">
        <div className="divide-y divide-border-subtle border-y border-border-subtle lg:grid lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <SliderRow
            label="Price comfort"
            valueLabel={priceComfortLabel(priceComfort)}
            min={10}
            max={300}
            step={10}
            value={priceComfort}
            onChange={setPriceComfort}
            startHint="£10"
            endHint="Any"
          />
          <SliderRow
            label="Fresh or trending"
            valueLabel={discoveryLabel(discoveryDial)}
            min={0}
            max={100}
            step={1}
            value={discoveryDial}
            onChange={setDiscoveryDial}
            startHint="Just-listed"
            endHint="Trending"
          />
        </div>
      </section>

      {/* Signal lists — stacked on mobile, side-by-side columns at xl.
          The grid wrapper is transparent below xl: same order, same mt-10
          rhythm each section already carries. */}
      <div className="xl:grid xl:grid-cols-2 xl:gap-x-12">
        <LocalTopicSection
          title="Interests"
          hint="Topics the feed weighs up or down — all removable, all on this device."
          kind="topics"
          items={topics}
          suggestions={SUGGESTED_TOPICS}
          addPlaceholder="Add an interest"
        />

        <LocalTopicSection
          title="Brands"
          hint="Brand signals you've set yourself — add or tune freely."
          kind="brands"
          items={brands}
          suggestions={SUGGESTED_BRANDS}
          addPlaceholder="Add a brand"
        />
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

export function AlgorithmView() {
  return DATA_MODE === 'live' ? <LiveAlgorithmView /> : <FixtureAlgorithmView />;
}
