import type { Listing } from '@/lib/contracts/domain';
import {
  type AnswerConfidence,
  type AnswerTrust,
  constraintCount,
  type ParsedIntent,
} from './convSearchTypes';
import { buildChips } from './convSearchChips';

// ---------------------------------------------------------------------------
// Turn content — honest reply copy, refinement prompts, starter queries
// ---------------------------------------------------------------------------

/** The one-line assistant reply. Numbers and words only — the chips and the
 *  results rail carry the meaning. */
export function replyFor(intent: ParsedIntent, total: number): string {
  if (constraintCount(intent) === 0) {
    return "Didn't catch a constraint in that — try a brand, category, or a price like “denim jacket under £40”.";
  }
  if (total === 0) {
    return 'No listings match that combination — remove a chip or loosen the range.';
  }
  return `${total} listing${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''} what I caught.`;
}

/** Most common whole-digit size in the result set — the honest "size N"
 *  suggestion for footwear turns. */
export function modalShoeSize(results: Listing[]): string | null {
  const counts = new Map<string, number>();
  for (const l of results) {
    const digits = (l.size ?? '').match(/\d{1,2}/)?.[0];
    if (digits) counts.set(digits, (counts.get(digits) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

/** Follow-up prompts — mobile buildRefinementSuggestions() logic, with the
 *  size suggestion grounded in the current result set. */
export function refinementsFor(intent: ParsedIntent, results: Listing[]): string[] {
  const out: string[] = [];
  if (intent.priceMax == null) {
    out.push('under £30', 'under £50');
  } else {
    out.push('over £100');
  }
  if (!intent.sustainable) out.push('sustainable only');
  if (intent.itemTerms.length > 0 && intent.colours.length === 0) out.push('in black');
  const wantsSize =
    intent.sizes.length === 0 &&
    (intent.categorySlugs.includes('sneakers') ||
      intent.itemTerms.some((t) => t === 'Boots'));
  if (wantsSize) {
    const modalSize = modalShoeSize(results);
    out.push(`size ${modalSize ?? '9'}`);
  }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Trust signal — honest per-answer confidence (mobile AITrustSignal parity)
// ---------------------------------------------------------------------------

/**
 * Confidence is derived from match quality, not fabricated: the count of
 * constraints the parser actually extracted and whether the catalogue
 * could satisfy them. Mirrors mobile's heuristic (≥3 matched keywords →
 * high, 1–2 → medium, 0 → low) plus the honest 'exploratory' tier for a
 * well-parsed query the catalogue can't satisfy.
 */
export function trustForAnswer(intent: ParsedIntent, results: Listing[]): AnswerTrust {
  const chips = buildChips(intent);
  const n = chips.length;
  const total = results.length;

  const confidence: AnswerConfidence =
    n === 0 ? 'low' : total === 0 ? 'exploratory' : n >= 3 ? 'high' : 'medium';

  const source =
    n === 0
      ? 'No keywords caught in that message'
      : `Matched keywords: ${chips
          .slice(0, 3)
          .map((c) => c.label)
          .join(', ')}${n > 3 ? ` +${n - 3} more` : ''}`;

  const expanded =
    n === 0
      ? 'Nothing in that message mapped to a brand, category, colour, size or price — try naming one.'
      : total === 0
        ? `${n} keyword${n === 1 ? '' : 's'} matched, but the catalogue holds nothing for this combination right now — removing a chip widens the net.`
        : `${n} keyword${n === 1 ? '' : 's'} matched ${total} listing${total === 1 ? '' : 's'} — ranked by likes, most-matched first.`;

  return { confidence, source, expanded };
}
