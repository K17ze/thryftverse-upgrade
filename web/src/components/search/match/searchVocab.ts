import { CATEGORIES, LISTINGS } from '@/lib/data/fixtures';
import { TAXONOMY_SEED } from '@/lib/contracts/taxonomy';
import { CATEGORY_TREE } from '../taxonomy';
import {
  diceCoefficient,
  levenshtein,
  normalizeTerm,
  singularForms,
  tokenize,
} from './searchTokens';

/**
 * Search vocabulary — normalized token → canonical display token.
 * Brands and taxonomy are indexed before catalogue terms so they win
 * ties. Canonical keeps the original casing, apostrophes and diacritics
 * ("Levi's", "Stüssy") so a corrected query still literal-matches a
 * backend that doesn't normalize.
 */
export const VOCAB = (() => {
  const map = new Map<string, string>();
  const add = (phrase: string) => {
    for (const rawToken of phrase.split(/\s+/)) {
      const token = normalizeTerm(rawToken);
      if (!token) continue;
      const canonical = rawToken.replace(/^[^A-Za-z0-9À-ÿ']+|[^A-Za-z0-9À-ÿ']+$/g, '');
      if (token.length >= 3 && !map.has(token)) map.set(token, canonical);
      // Punctuation-joined tokens ("A.P.C.", "Levi's") also index their
      // collapsed form so "apc" / "levis" resolve.
      const collapsed = token.replace(/\s+/g, '');
      if (collapsed.length >= 3 && collapsed !== token && !map.has(collapsed)) {
        map.set(collapsed, canonical);
      }
    }
  };
  for (const l of LISTINGS) if (l.brand) add(l.brand);
  for (const c of CATEGORIES) {
    add(c.name);
    add(c.slug);
  }
  // Canonical taxonomy — ids, display names and synonyms cover the live
  // vocabulary (kids, hobbies…) even where the fixture set doesn't.
  for (const node of TAXONOMY_SEED.categories) {
    add(node.id);
    add(node.name);
    for (const syn of node.synonyms ?? []) add(syn);
  }
  for (const subs of Object.values(CATEGORY_TREE)) for (const s of subs) add(s);
  for (const l of LISTINGS) {
    add(l.title);
    if (l.subcategory) add(l.subcategory);
  }
  return map;
})();

/** Canonical token for a query token — exact or plural-form vocab hit. */
export function vocabLookup(token: string): string | null {
  const direct = VOCAB.get(token);
  if (direct) return direct;
  for (const form of [`${token}s`, `${token}es`, ...singularForms(token)]) {
    const hit = VOCAB.get(form);
    if (hit) return hit;
  }
  return null;
}

/**
 * Best fuzzy correction for a token — Levenshtein ≤ 2 (tokens ≥ 4 chars)
 * or bigram-Dice ≥ 0.5. First-best wins on ties, so vocabulary order
 * (brands → categories → catalogue terms) keeps it deterministic.
 */
export function fuzzyLookup(token: string): string | null {
  if (token.length < 3 || /^\d+$/.test(token)) return null;
  let best: string | null = null;
  let bestScore = 0.5;
  for (const [norm, canonical] of VOCAB) {
    let score = diceCoefficient(token, norm);
    if (token.length >= 4) {
      const distance = levenshtein(token, norm);
      if (distance <= 2) {
        score = Math.max(score, 1 - distance / Math.max(token.length, norm.length));
      }
    }
    if (score >= 0.5 && (best === null || score > bestScore)) {
      best = canonical;
      bestScore = score;
    }
  }
  return best;
}

/** Canonical correction for a query, or null when nothing changed. */
export function suggestCorrection(query: string): string | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  let changed = false;
  const resolved = tokens.map((token) => {
    const canonical = vocabLookup(token) ?? fuzzyLookup(token);
    if (canonical !== null && canonical !== token) {
      changed = true;
      return canonical;
    }
    return token;
  });
  return changed ? resolved.join(' ') : null;
}
