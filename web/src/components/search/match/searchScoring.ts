import type { Listing } from '@/lib/contracts/domain';
import { parseIntent } from '@/components/convsearch/convSearchEngine';
import { categoryLabel } from '../categoryDirectoryStore';
import { singularForms, tokenize } from './searchTokens';

export const categoryName = (value: string | undefined) =>
  value ? categoryLabel(value) : undefined;

/** Per-field token sets — the field a token hits is what it scores on. */
export interface ListingTokenFields {
  title: Set<string>;
  brand: Set<string>;
  detail: Set<string>; // subcategory + category slug + category name
}

export function listingFields(l: Listing): ListingTokenFields {
  return {
    title: new Set(tokenize(l.title)),
    brand: new Set(tokenize(l.brand ?? '')),
    detail: new Set(
      tokenize(
        `${l.subcategory ?? ''} ${l.category} ${categoryName(l.category) ?? ''}`,
      ),
    ),
  };
}

/** 'exact' covers singular/plural forms; 'prefix' is the >=4-char stem hit. */
export function fieldHit(
  token: string,
  field: Set<string>,
): 'exact' | 'prefix' | null {
  if (field.has(token)) return 'exact';
  for (const form of [`${token}s`, `${token}es`, ...singularForms(token)]) {
    if (field.has(form)) return 'exact';
  }
  // Prefix leniency — "swea" still finds "sweater".
  if (token.length >= 4) {
    for (const f of field) {
      if (f.startsWith(token)) return 'prefix';
    }
  }
  return null;
}

/**
 * Canonical semantic vocabulary for a text span — delegated to the
 * conversational-search parser, which owns the shared synonym
 * dictionaries. Item terms, category slugs, brand canonicals and colour
 * names are reduced to normalized tokens so a query word and a listing
 * meet on the same canonical ground ("khaki"→Sage, "ysl"→Yves Saint
 * Laurent, "trainers"→sneakers). One-char tokens are dropped — "t" from
 * "T-shirt" is noise, not signal.
 */
export function semanticTokens(text: string): Set<string> {
  const intent = parseIntent(text);
  const out = new Set<string>();
  const addWords = (phrase: string) => {
    for (const token of tokenize(phrase)) {
      if (token.length > 1) out.add(token);
    }
  };
  for (const term of intent.itemTerms) addWords(term);
  for (const slug of intent.categorySlugs) out.add(slug);
  for (const brand of intent.brands) addWords(brand);
  for (const colour of intent.colours) addWords(colour);
  return out;
}

/** Listing-side canonicals — same vocabulary, plus the category slug
 *  the catalogue itself assigns (a listing needn't name its own
 *  department for "trainers" to find it). */
export function listingSemanticTokens(l: Listing): Set<string> {
  const semantics = semanticTokens(
    [l.title, l.brand ?? '', l.subcategory ?? ''].join(' '),
  );
  semantics.add(l.category.toLowerCase());
  return semantics;
}

/** Field-tier weights — a title hit outranks a subcategory hit, which
 *  outranks a synonym-only expansion. Prefix hits are discounted. */
export const TIER_WEIGHT = {
  title: 4,
  brand: 3.5,
  detail: 2.5,
  semantic: 1,
} as const;
export const PREFIX_DISCOUNT = 0.65;

/**
 * Score one listing against the tokenized query — null when any token
 * fails to resolve (AND semantics: every token must hit). The score is
 * sum of per-token field weights plus a bounded engagement signal
 * (log-scaled likes/views, bump boost) so popularity breaks ties rather
 * than producing matches.
 */
export function scoreListing(
  l: Listing,
  tokens: string[],
  fields: ListingTokenFields,
  querySemantics: Map<string, Set<string>>,
  semantics: Set<string> | null,
): number | null {
  let sem = semantics;
  let score = 0;
  for (const token of tokens) {
    let tier: number | null = null;
    for (const [field, weight] of [
      [fields.title, TIER_WEIGHT.title],
      [fields.brand, TIER_WEIGHT.brand],
      [fields.detail, TIER_WEIGHT.detail],
    ] as const) {
      const hit = fieldHit(token, field);
      if (hit !== null) {
        tier = weight * (hit === 'prefix' ? PREFIX_DISCOUNT : 1);
        break;
      }
    }
    if (tier === null) {
      const expanded = querySemantics.get(token);
      if (expanded && expanded.size > 0) {
        sem ??= listingSemanticTokens(l);
        for (const canonical of expanded) {
          if (sem.has(canonical)) {
            tier = TIER_WEIGHT.semantic;
            break;
          }
        }
      }
    }
    if (tier === null) return null;
    score += tier;
  }
  // Engagement is a tiebreak signal, not a gate — a perfect match on an
  // unliked listing still outranks a fuzzy hit on a popular one.
  return (
    score +
    Math.log1p(l.likes) * 0.35 +
    Math.log1p(l.views ?? 0) * 0.15 +
    (l.isBumped ? 0.3 : 0)
  );
}

/**
 * Token-AND match: every query token must resolve against the listing's
 * title/brand/category/subcategory tokens. A token that fails the
 * literal/plural/prefix pass can still land through the shared synonym
 * vocabulary — its canonical form must intersect the listing's own
 * canonicals, so "sneakers" matches a trainer listing but never a
 * random one. Empty query passes through.
 */
export function matchCore(
  listings: Listing[],
  tokens: string[],
): { matched: Listing[]; scores: Map<string, number> } {
  const querySemantics = new Map(
    tokens.map((token) => [token, semanticTokens(token)]),
  );
  const matched: Listing[] = [];
  const scores = new Map<string, number>();
  for (const l of listings) {
    const fields = listingFields(l);
    const score = scoreListing(l, tokens, fields, querySemantics, null);
    if (score === null) continue;
    matched.push(l);
    scores.set(l.id, score);
  }
  return { matched, scores };
}
