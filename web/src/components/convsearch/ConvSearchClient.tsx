'use client';

/**
 * ConvSearchClient — /search/chat orchestrator.
 *
 * A chat thread over the catalogue: user message → typing tick → assistant
 * reply with matched-keyword chips, an inline results rail and a hand-off
 * link into /search. All parsing is the deterministic local engine
 * (convSearchEngine) — the header labels it honestly: rule-based, full AI
 * matching ships later.
 *
 * Seeded by the /search params (?q=&category=&…) when arriving via the
 * "Refine in chat" entry point, so live filters carry into the thread.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  constraintCount,
  intentFromParams,
  matchIntent,
  mergeIntent,
  parseIntent,
  removeConstraint,
  replyFor,
  type ConstraintChip,
  type ParsedIntent,
} from './convSearchEngine';
import { ChatComposer } from './ChatComposer';
import { ChatTurns, EmptyThread, type ChatTurn } from './ChatTurns';

/** Deterministic local parse — the tick between turns is presentation,
 *  same as mobile's 520ms fallback delay. */
const REPLY_DELAY_MS = 550;

let nextId = 0;
function turnId(): string {
  nextId += 1;
  return `turn-${nextId}`;
}

function assistantTurn(intent: ParsedIntent, rawQuery: string, seeded: boolean): ChatTurn {
  const count = constraintCount(intent);
  // An empty parse is not a match — no rail for "didn't catch" turns.
  const results = count > 0 ? matchIntent(intent) : [];
  const reply = replyFor(intent, results.length);
  return {
    id: turnId(),
    role: 'assistant',
    text:
      seeded && count > 0
        ? `Carried over your filters — ${reply.charAt(0).toLowerCase()}${reply.slice(1)}`
        : reply,
    intent,
    results,
    rawQuery,
  };
}

/** Build the opening thread from the /search params the user arrived with. */
function seedTurns(params: Pick<URLSearchParams, 'get'>): ChatTurn[] {
  const { intent, queryText } = intentFromParams(params);
  if (!intent) return [];
  const turns: ChatTurn[] = [];
  if (queryText) {
    turns.push({ id: turnId(), role: 'user', text: queryText });
    turns.push(assistantTurn(intent, queryText, false));
  } else {
    turns.push(assistantTurn(intent, '', true));
  }
  return turns;
}

export function ConvSearchClient() {
  const params = useSearchParams();
  const paramString = params.toString();
  const [turns, setTurns] = useState<ChatTurn[]>(() => seedTurns(params));
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Re-seed when the entry params change (e.g. a second "Refine in chat").
  useEffect(() => {
    setTurns(seedTurns(new URLSearchParams(paramString)));
  }, [paramString]);

  // Keep the latest turn on screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, isTyping]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || isTyping) return;
      setInput('');
      setIsTyping(true);
      setTurns((prev) => [...prev, { id: turnId(), role: 'user', text }]);

      timerRef.current = setTimeout(() => {
        setTurns((prev) => {
          // Refine against the last assistant intent — follow-ups like
          // "under £30" update the range instead of starting over.
          const prior = [...prev].reverse().find((t) => t.role === 'assistant' && t.intent);
          const parsed = parseIntent(text);
          const intent = prior?.intent ? mergeIntent(prior.intent, parsed) : parsed;
          return [...prev, assistantTurn(intent, text, false)];
        });
        setIsTyping(false);
      }, REPLY_DELAY_MS);
    },
    [isTyping],
  );

  const handleRemoveChip = useCallback((id: string, chip: ConstraintChip) => {
    // Re-run the turn without that constraint — in place, so the thread
    // stays a clean record of what the parser holds.
    setTurns((prev) =>
      prev.map((t) => {
        if (t.id !== id || !t.intent) return t;
        const intent = removeConstraint(t.intent, chip);
        const results = matchIntent(intent);
        return { ...t, intent, results, text: replyFor(intent, results.length) };
      }),
    );
  }, []);

  const empty = turns.length === 0 && !isTyping;

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.75rem)] w-full max-w-3xl flex-col px-4 sm:px-6 md:h-[calc(100dvh-4rem)]">
      {/* Header — title, honest capability note, text-search escape */}
      <div className="flex items-center justify-between gap-3 pt-5">
        <h1 className="text-section-title font-semibold text-text-primary">
          Conversational search
        </h1>
        <Link
          href="/search"
          className="pressable flex items-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="search" size={14} />
          Text search
        </Link>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-meta text-text-muted">
        <Icon name="info" size={12} />
        Rule-based search — full AI matching ships later.
      </p>

      {/* Thread */}
      <div ref={scrollRef} className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {empty ? (
          <EmptyThread onPick={send} />
        ) : (
          <ChatTurns
            turns={turns}
            isTyping={isTyping}
            onRemoveChip={handleRemoveChip}
            onRefine={send}
          />
        )}
      </div>

      <ChatComposer value={input} onChange={setInput} onSubmit={send} disabled={isTyping} />
      <div className="h-3 shrink-0" aria-hidden />
    </div>
  );
}
