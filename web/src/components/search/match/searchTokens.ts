/** lowercase, fold diacritics ("Stüssy"→"stussy"), punctuation→space. */
export function normalizeTerm(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const normalized = normalizeTerm(input);
  return normalized ? normalized.split(' ') : [];
}

/** Naive singular candidates — "dresses"→"dress", "bodies"→"body". */
export function singularForms(token: string): string[] {
  const out: string[] = [];
  if (token.endsWith('ies') && token.length > 4) out.push(`${token.slice(0, -3)}y`);
  if (token.endsWith('es') && token.length > 3) out.push(token.slice(0, -2));
  if (token.endsWith('s') && token.length > 3) out.push(token.slice(0, -1));
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Bigram-Dice coefficient — cheap fuzzy score for short tokens. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigrams.add(a.slice(i, i + 2));
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigrams.has(b.slice(i, i + 2))) shared++;
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}
