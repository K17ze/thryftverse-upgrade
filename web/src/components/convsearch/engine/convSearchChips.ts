import type { ConstraintChip, ParsedIntent } from './convSearchTypes';

// ---------------------------------------------------------------------------
// Chips — parsed constraints shown under each assistant turn; removable.
// ---------------------------------------------------------------------------

export function buildChips(intent: ParsedIntent): ConstraintChip[] {
  const chips: ConstraintChip[] = [];
  for (const b of intent.brands) {
    chips.push({ id: `brand:${b.toLowerCase()}`, kind: 'brand', value: b, label: `Brand: ${b}` });
  }
  for (const slug of intent.categorySlugs) {
    const label = slug.charAt(0).toUpperCase() + slug.slice(1);
    chips.push({ id: `category:${slug}`, kind: 'category', value: slug, label: `Category: ${label}` });
  }
  for (const t of intent.itemTerms) {
    chips.push({ id: `item:${t.toLowerCase()}`, kind: 'item', value: t, label: t });
  }
  for (const s of intent.sizes) {
    chips.push({ id: `size:${s.toLowerCase()}`, kind: 'size', value: s, label: `Size: ${s.toUpperCase()}` });
  }
  for (const c of intent.conditions) {
    chips.push({ id: `condition:${c.toLowerCase()}`, kind: 'condition', value: c, label: `Condition: ${c}` });
  }
  for (const c of intent.colours) {
    chips.push({ id: `colour:${c.toLowerCase()}`, kind: 'colour', value: c, label: `Colour: ${c}` });
  }
  for (const s of intent.styles) {
    chips.push({ id: `style:${s.toLowerCase()}`, kind: 'style', value: s, label: `Style: ${s}` });
  }
  if (intent.priceMin != null || intent.priceMax != null) {
    const label =
      intent.priceMin != null && intent.priceMax != null
        ? `Price: £${intent.priceMin}–£${intent.priceMax}`
        : intent.priceMax != null
          ? `Price: under £${intent.priceMax}`
          : `Price: over £${intent.priceMin}`;
    chips.push({ id: 'price:range', kind: 'price', value: 'range', label });
  }
  if (intent.sustainable) {
    chips.push({ id: 'sustainable:only', kind: 'sustainable', value: 'only', label: 'Sustainable only' });
  }
  for (const k of intent.keywords) {
    chips.push({ id: `keyword:${k}`, kind: 'keyword', value: k, label: `“${k}”` });
  }
  return chips;
}

/** Strip one constraint and return a fresh intent for the re-run. */
export function removeConstraint(intent: ParsedIntent, chip: ConstraintChip): ParsedIntent {
  const drop = (list: string[], value: string) =>
    list.filter((v) => v.toLowerCase() !== value.toLowerCase());
  const next: ParsedIntent = { ...intent };
  switch (chip.kind) {
    case 'brand':
      next.brands = drop(intent.brands, chip.value);
      break;
    case 'category':
      next.categorySlugs = drop(intent.categorySlugs, chip.value);
      break;
    case 'item':
      next.itemTerms = drop(intent.itemTerms, chip.value);
      break;
    case 'size':
      next.sizes = drop(intent.sizes, chip.value);
      break;
    case 'condition':
      next.conditions = intent.conditions.filter(
        (c) => c.toLowerCase() !== chip.value.toLowerCase(),
      );
      break;
    case 'price':
      next.priceMin = null;
      next.priceMax = null;
      break;
    case 'colour':
      next.colours = drop(intent.colours, chip.value);
      break;
    case 'style':
      next.styles = drop(intent.styles, chip.value);
      break;
    case 'sustainable':
      next.sustainable = false;
      break;
    case 'keyword':
      next.keywords = drop(intent.keywords, chip.value);
      break;
  }
  return next;
}
