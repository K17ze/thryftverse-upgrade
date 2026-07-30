export const PRODUCT_RECOMMENDATION_POLICY_VERSION =
  'product-contextual-recommendation-v2.0';

type ProductSignals = {
  id: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  price_gbp: number | string;
  seller_id: string;
  created_at: string;
};

type SourceSignals = Omit<ProductSignals, 'id' | 'created_at'>;

function normalized(value: string | null): string {
  return value?.trim().toLocaleLowerCase('en-GB') ?? '';
}

function exactMatch(left: string | null, right: string | null): number {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  return normalizedLeft && normalizedRight && normalizedLeft === normalizedRight ? 1 : 0;
}

function priceAlignment(candidatePrice: number, sourcePrice: number): number {
  if (!Number.isFinite(candidatePrice) || !Number.isFinite(sourcePrice)
    || candidatePrice <= 0 || sourcePrice <= 0) {
    return 0.5;
  }
  return Math.exp(-1.3 * Math.abs(Math.log(candidatePrice / sourcePrice)));
}

function freshness(createdAt: string, asOf: string): number {
  const created = Date.parse(createdAt);
  const now = Date.parse(asOf);
  if (!Number.isFinite(created) || !Number.isFinite(now)) {
    return 0.45;
  }
  const ageDays = Math.max(0, (now - created) / 86_400_000);
  return Math.exp(-ageDays / 30);
}

export function scoreProductRecommendation(input: {
  candidate: ProductSignals;
  source: SourceSignals;
  asOf: string;
}): {
  score: number;
  reasonCodes: string[];
  components: Record<string, number>;
} {
  const components = {
    category: exactMatch(input.candidate.category, input.source.category),
    brand: exactMatch(input.candidate.brand, input.source.brand),
    size: exactMatch(input.candidate.size, input.source.size),
    condition: exactMatch(input.candidate.condition, input.source.condition),
    price_alignment: priceAlignment(
      Number(input.candidate.price_gbp),
      Number(input.source.price_gbp),
    ),
    freshness: freshness(input.candidate.created_at, input.asOf),
    seller_diversity: input.candidate.seller_id === input.source.seller_id ? 0 : 1,
  };
  const score =
    0.04
    + 0.30 * components.category
    + 0.18 * components.brand
    + 0.12 * components.size
    + 0.08 * components.condition
    + 0.16 * components.price_alignment
    + 0.08 * components.freshness
    + 0.04 * components.seller_diversity;
  const reasonCodes = [
    ['same_category', components.category],
    ['same_brand', components.brand],
    ['same_size', components.size],
    ['same_condition', components.condition],
    ['similar_price', components.price_alignment],
    ['recent_listing', components.freshness],
  ]
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, 3)
    .map(([reason]) => String(reason));

  return {
    score: Number(Math.min(1, Math.max(0, score)).toFixed(6)),
    reasonCodes,
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [
        key,
        Number(value.toFixed(6)),
      ]),
    ),
  };
}
