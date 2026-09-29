'use client';

/**
 * ConvSearchClient — /search/chat orchestrator.
 *
 * A chat thread over the catalogue: user message → typing tick → assistant
 * reply with matched-keyword chips, an inline results rail and a hand-off
 * link into /search.
 *
 * Live mode is backend-first (mobile parity): every user message posts to
 * POST /search/conversational, the reply's chips are the server's
 * `parsedFilters`, its disclosure string (`method`) renders verbatim, and
 * the results rail is real listings resolved through the same
 * listing-fetch path every other surface uses (`data.listings`) — never
 * the fixture catalogue. The local deterministic engine
 * (convSearchEngine) only answers when the request fails, and the turn
 * says so. Fixture mode stays the fully-local design surface (Demo badge).
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
  intentFromApiFilters,
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
import { data, DATA_MODE } from '@/lib/api/client';
import { runConversationalSearch } from '@/lib/api/services/search';
import {
  listingColourNames,
  type ListingFilters,
} from '@/components/filters/filterTypes';
import type { Listing } from '@/lib/contracts/domain';

/** Fixture-mode presentation tick between turns — same rhythm as the
 *  mobile fallback delay. Live mode waits on the real request instead. */
const REPLY_DELAY_MS = 550;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let nextId = 0;
function turnId(): string {
  nextId += 1;
  return `turn-${nextId}`;
}

/**
 * Resolve an intent to real listings through the surface's normal fetch
 * path. Live mode goes on the wire — the intent's searchable terms form
 * the query, its facets ride as filters (the server is the matcher);
 * colours narrow client-side because no backend facet exists (same
 * "only provable colours filter" rule as the local engine). Fixture
 * mode filters LISTINGS locally.
 */
async function resolveIntentResults(
  intent: ParsedIntent,
  rawQuery: string,
): Promise<{ items: Listing[]; total: number }> {
  if (DATA_MODE !== 'live') {
    const items = matchIntent(intent);
    return { items, total: items.length };
  }
  const filters: ListingFilters = {
    conditions: intent.conditions,
    priceMin: intent.priceMin,
    priceMax: intent.priceMax,
    categories: intent.categorySlugs,
    sizes: intent.sizes,
    brands: intent.brands,
    // Not a wire facet — narrowed client-side below.
    colours: [],
    includeSold: false,
  };
  const terms = [
    ...intent.itemTerms,
    ...intent.keywords,
    ...intent.brands,
    ...intent.styles,
  ]
    .join(' ')
    .trim();
  // A follow-up like "under £30" carries no item terms of its own — the
  // merged intent's words (or, failing that, the raw message) form the q.
  const fallback = rawQuery.trim();
  const query = terms.length >= 2 ? terms : fallback.length >= 1 ? fallback : undefined;
  const page = await data.listings({ query, filters, limit: 24 });
  let items = page.items;
  if (intent.colours.length > 0) {
    items = items.filter((l) => {
      const named = listingColourNames(l);
      return named.length === 0 || intent.colours.some((c) => named.includes(c));
    });
  }
  return { items, total: page.total ?? items.length };
}

/** Build an assistant turn — resolves listings, writes the honest reply. */
async function assistantTurn(
  intent: ParsedIntent,
  rawQuery: string,
  seeded: boolean,
  source: ChatTurn['source'],
  method?: string,
): Promise<ChatTurn> {
  const count = constraintCount(intent);
  let results: Listing[] = [];
  let total = 0;
  let failed = false;
  if (count > 0) {
    try {
      const page = await resolveIntentResults(intent, rawQuery);
      results = page.items;
      total = page.total;
    } catch {
      failed = true;
    }
  }
  const reply = failed
    ? "Couldn't load matching listings — check your connection and try again."
    : replyFor(intent, total);
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
    source,
    method,
  };
}

export function ConvSearchClient() {
  const params = useSearchParams();
  const paramString = params.toString();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** The last assistant intent — follow-ups ("under £30") merge onto it. */
  const lastIntentRef = useRef<ParsedIntent | null>(null);
  /** Bumped on re-seed so an in-flight reply can't land on a new thread. */
  const generationRef = useRef(0);

  // Seed (and re-seed) from the entry params — async: the seeded intent's
  // rail resolves through the real listing fetch in live mode.
  useEffect(() => {
    const generation = ++generationRef.current;
    const { intent, queryText } = intentFromParams(
      new URLSearchParams(paramString),
    );
    if (!intent) {
      setTurns([]);
      lastIntentRef.current = null;
      return;
    }
    const userTurn: ChatTurn | null = queryText
      ? { id: turnId(), role: 'user', text: queryText }
      : null;
    setTurns(userTurn ? [userTurn] : []);
    setIsTyping(true);
    void assistantTurn(intent, queryText, true, 'seed')
      .then((turn) => {
        if (generation !== generationRef.current) return;
        setTurns((prev) => [...prev, turn]);
        setIsTyping(false);
      })
      .catch(() => {
        if (generation === generationRef.current) setIsTyping(false);
      });
  }, [paramString]);

  // Mirror of the latest assistant intent for merge-on-follow-up.
  useEffect(() => {
    lastIntentRef.current =
      [...turns].reverse().find((t) => t.role === 'assistant' && t.intent)
        ?.intent ?? null;
  }, [turns]);

  // Keep the latest turn on screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, isTyping]);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || isTyping) return;
      setInput('');
      setIsTyping(true);
      setTurns((prev) => [...prev, { id: turnId(), role: 'user', text }]);
      const generation = generationRef.current;
      const prior = lastIntentRef.current;

      void (async () => {
        let parsed: ParsedIntent;
        let source: ChatTurn['source'];
        let method: string | undefined;
        if (DATA_MODE === 'live') {
          try {
            // Backend-first — the server's keyword parse owns the chips;
            // the local engine only answers a failed request.
            const res = await runConversationalSearch(text, 24);
            parsed = intentFromApiFilters(res.parsedFilters);
            source = 'backend';
            method = res.method ?? res.retrievalMethod;
          } catch {
            parsed = parseIntent(text);
            source = 'fallback';
          }
        } else {
          await delay(REPLY_DELAY_MS);
          parsed = parseIntent(text);
          source = undefined;
        }
        const intent = prior ? mergeIntent(prior, parsed) : parsed;
        const turn = await assistantTurn(intent, text, false, source, method);
        if (generation !== generationRef.current) return;
        setTurns((prev) => [...prev, turn]);
        setIsTyping(false);
      })().catch(() => {
        if (generation === generationRef.current) setIsTyping(false);
      });
    },
    [isTyping],
  );

  const handleRemoveChip = useCallback((id: string, chip: ConstraintChip) => {
    // Re-run the turn without that constraint — in place, so the thread
    // stays a clean record of what the parser holds. Live mode re-fetches
    // real listings for the narrowed intent rather than re-filtering the
    // stale page.
    let next: ParsedIntent | null = null;
    setTurns((prev) =>
      prev.map((t) => {
        if (t.id !== id || !t.intent) return t;
        next = removeConstraint(t.intent, chip);
        return { ...t, intent: next, results: [] };
      }),
    );
    const intent = next;
    if (!intent) return;
    void (async () => {
      let results: Listing[] = [];
      let text = '';
      try {
        const page = await resolveIntentResults(intent, '');
        results = page.items;
        text = replyFor(intent, page.total);
      } catch {
        text =
          "Couldn't load matching listings — check your connection and try again.";
      }
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id && t.intent === intent ? { ...t, results, text } : t,
        ),
      );
    })();
  }, []);

  const empty = turns.length === 0 && !isTyping;

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.75rem)] w-full max-w-3xl flex-col px-4 sm:px-6 md:h-[calc(100dvh-4rem)] xl:max-w-4xl">
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
