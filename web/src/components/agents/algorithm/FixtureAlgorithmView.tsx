'use client';

import { useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useHydrated } from '@/lib/store/useStore';
import {
  discoveryLabel,
  priceComfortLabel,
  useAlgorithmPrefs,
  type AlgoTopic,
} from '../useAlgorithmPrefs';
import {
  PageHeader,
  SUGGESTED_BRANDS,
  SUGGESTED_TOPICS,
  WeightControl,
} from './AlgorithmPrimitives';

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

export function FixtureAlgorithmView() {
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

          {/* Signal lists — stacked on mobile, side-by-side columns at xl. */}
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
