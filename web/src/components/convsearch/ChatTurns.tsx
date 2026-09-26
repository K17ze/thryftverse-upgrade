'use client';

/**
 * ChatTurns — the conversation thread.
 *
 * User turns are right-aligned brand bubbles. Assistant turns carry the
 * honest machinery: a text reply, the matched-keyword chips (removable →
 * the turn re-runs), a results rail of ProductTiles, an "Open these
 * results" hand-off into /search, and refinement prompts — the same turn
 * anatomy as mobile's ConversationalSearchScreen.
 */

import Link from 'next/link';
import { ProductTile } from '@/components/cards/ProductTile';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/Chip';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import type { Listing } from '@/lib/contracts/domain';
import {
  buildChips,
  constraintCount,
  refinementsFor,
  searchHref,
  STARTER_PROMPTS,
  type ConstraintChip,
  type ParsedIntent,
} from './convSearchEngine';

// ---------------------------------------------------------------------------
// Turn model — owned by ConvSearchClient, rendered here
// ---------------------------------------------------------------------------

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  /** User: the raw message. Assistant: replyFor() copy. */
  text: string;
  /** Assistant turns only. */
  intent?: ParsedIntent;
  /** Assistant turns only — the matched set (rail shows a slice). */
  results?: Listing[];
  /** The user text that produced this turn — feeds the /search hand-off. */
  rawQuery?: string;
}

const RAIL_LIMIT = 8;

// ---------------------------------------------------------------------------
// Empty state — greeting + starter prompts from trending terms
// ---------------------------------------------------------------------------

export function EmptyThread({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col justify-center px-1 py-10">
      <h2 className="text-item-title font-semibold text-text-primary">
        Describe what you’re after
      </h2>
      <p className="mt-2 max-w-md text-body text-text-secondary">
        I pull brands, categories, sizes, colours and prices out of plain
        words and match the catalogue — you can remove any keyword I caught.
      </p>
      <p className="mt-6 text-label font-semibold uppercase tracking-wide text-text-muted">
        Try
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {STARTER_PROMPTS.map((prompt) => (
          <Chip key={prompt} onClick={() => onPick(prompt)}>
            {prompt}
          </Chip>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing indicator — the tick between turns
// ---------------------------------------------------------------------------

export function TypingBubble() {
  return (
    <div className="flex" aria-label="Searching" role="status">
      <div className="flex items-center gap-1.5 rounded-chat bg-surface px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="motion-safe:animate-bounce h-1.5 w-1.5 rounded-full bg-text-muted"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constraint chips — matched keywords, removable → turn re-runs
// ---------------------------------------------------------------------------

function ConstraintChipButton({
  chip,
  onRemove,
}: {
  chip: ConstraintChip;
  onRemove: (chip: ConstraintChip) => void;
}) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full border border-border-subtle bg-surface-alt pl-3 pr-1 text-caption font-medium text-text-primary">
      {chip.label}
      <button
        type="button"
        onClick={() => onRemove(chip)}
        aria-label={`Remove ${chip.label}`}
        className="pressable flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:text-text-primary"
      >
        <Icon name="close" size={13} />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Assistant turn — reply, chips, results rail, hand-off, refinements
// ---------------------------------------------------------------------------

function AssistantTurn({
  turn,
  disabled,
  onRemoveChip,
  onRefine,
}: {
  turn: ChatTurn;
  disabled: boolean;
  onRemoveChip: (turnId: string, chip: ConstraintChip) => void;
  onRefine: (text: string) => void;
}) {
  const intent = turn.intent;
  const hasConstraints = !!intent && constraintCount(intent) > 0;
  const results = hasConstraints ? (turn.results ?? []) : [];
  const chips = hasConstraints ? buildChips(intent) : [];
  const refinements = hasConstraints ? refinementsFor(intent, results) : [];
  const rail = results.slice(0, RAIL_LIMIT).map(mapListingToDiscoverySummary);

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-[92%] rounded-chat bg-surface px-4 py-3 sm:max-w-[80%]">
        <p className="text-body text-text-primary">{turn.text}</p>

        {chips.length > 0 ? (
          <div className="mt-3">
            <p className="text-meta text-text-muted">Matched keywords — tap × to remove</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <ConstraintChipButton
                  key={chip.id}
                  chip={chip}
                  onRemove={(c) => onRemoveChip(turn.id, c)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {refinements.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-meta text-text-muted">Refine:</span>
            {refinements.map((r) => (
              <button
                key={r}
                type="button"
                disabled={disabled}
                onClick={() => onRefine(r)}
                className="pressable inline-flex h-7 items-center rounded-full border border-border-subtle px-3 text-caption font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                {r}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {rail.length > 0 ? (
        <div>
          <div
            className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1"
            role="list"
            aria-label="Matching listings"
          >
            {rail.map((item) => (
              <div
                key={item.id}
                role="listitem"
                className="w-[132px] shrink-0 snap-start sm:w-[150px]"
              >
                <ProductTile item={item} />
              </div>
            ))}
          </div>

          {intent ? (
            <Link
              href={searchHref(intent, results, turn.rawQuery ?? '')}
              className="pressable mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-alt px-4 text-body font-medium text-text-primary hover:bg-surface-raised"
            >
              Open these results
              <Icon name="forward" size={15} />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

export function ChatTurns({
  turns,
  isTyping,
  onRemoveChip,
  onRefine,
}: {
  turns: ChatTurn[];
  isTyping: boolean;
  onRemoveChip: (turnId: string, chip: ConstraintChip) => void;
  onRefine: (text: string) => void;
}) {
  return (
    <ol className="flex flex-col gap-4 px-1 py-4" aria-label="Conversation">
      {turns.map((turn) => (
        <li key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex'}>
          {turn.role === 'user' ? (
            <div className="max-w-[85%] rounded-chat bg-brand px-4 py-3 sm:max-w-[75%]">
              <p className="text-body text-text-inverse">{turn.text}</p>
            </div>
          ) : (
            <AssistantTurn
              turn={turn}
              disabled={isTyping}
              onRemoveChip={onRemoveChip}
              onRefine={onRefine}
            />
          )}
        </li>
      ))}
      {isTyping ? (
        <li>
          <TypingBubble />
        </li>
      ) : null}
    </ol>
  );
}
