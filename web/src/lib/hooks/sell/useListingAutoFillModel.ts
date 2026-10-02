import type { ListingCondition } from '@/lib/contracts/domain';
import type { TaxonomyCollection, TaxonomyNode } from '@/lib/contracts/taxonomy';
import type { AutoFillSuggestion } from '@/components/sell/PhotosSection';
import type { SellDraft } from '@/components/sell/constants';
import {
  SIZE_OPTIONS,
  canonicalCategoryId,
  categoryNodeName,
  conditionAllowedFor,
} from '@/components/sell/taxonomy';
import type * as listingIntelligenceService from '@/lib/api/services/listingIntelligence';
import type { AutoFillControl } from '@/components/sell/PhotosSection';

/**
 * Backend condition candidates → the composer's canonical conditions.
 * 'New' is deliberately unmapped — the notes evidence behind it
 * ("never worn", nwot) cannot attest to attached tags, and selecting
 * 'New with tags' would overstate the item. Mapping down never does.
 */
export const CONDITION_CANDIDATE_MAP: Record<string, ListingCondition> = {
  'like new': 'Very good',
  'very good': 'Very good',
  good: 'Good',
  fair: 'Satisfactory',
};

/** Last path segment of a remote media URL — the filename evidence for
 *  edit-mode media that has no picked File behind it. blob:/data: refs
 *  carry no filename, so they return undefined honestly. */
export function remoteFileName(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    const last = decodeURIComponent(
      parsed.pathname.split('/').filter(Boolean).pop() ?? '',
    );
    return last.includes('.') ? last : undefined;
  } catch {
    return undefined;
  }
}

/** The draft value a pending suggestion watches — when the seller fills the
 *  field themselves the stale suggestion auto-dismisses rather than sitting
 *  armed to overwrite their input. Null = no draft field to watch. */
export function fieldIsFilled(key: string, draft: SellDraft): boolean {
  switch (key) {
    case 'title':
      return !!draft.title.trim();
    case 'brand':
      return !!draft.brand.trim();
    case 'category':
      return !!draft.category;
    case 'size':
      return !!draft.size;
    case 'condition':
      return !!draft.condition;
    default:
      return false;
  }
}

export type AutoFillState = Omit<
  AutoFillControl,
  'onRun' | 'onDismiss' | 'onAccept' | 'onDismissField' | 'onAcceptAll'
>;

export interface ProcessedRunResults {
  suggestions: AutoFillSuggestion[];
  suggested: number;
  basis: string;
}

export function processRunCandidates(
  candidates: Awaited<ReturnType<typeof listingIntelligenceService.runListingIntelligence>>['candidates'],
  draft: SellDraft,
  taxonomy: TaxonomyCollection,
): ProcessedRunResults {
  const suggestions: AutoFillSuggestion[] = [];
  const basisSources = new Set<string>();
  let suggested = 0;

  let suggestedCategoryId = '';
  if (!draft.category) {
    const catCandidate = candidates.find(
      (c) => !c.abstained && c.field === 'category' && c.value?.trim(),
    );
    const v = catCandidate?.value?.trim() ?? '';
    if (v) {
      suggestedCategoryId =
        canonicalCategoryId(v) ||
        taxonomy.categories.find(
          (n: TaxonomyNode) => n.parentId === null && n.name.toLowerCase() === v.toLowerCase(),
        )?.id ||
        '';
    }
  }

  for (const c of candidates) {
    if (c.abstained) continue;
    const value = c.value?.trim();
    if (!value) continue;

    switch (c.field) {
      case 'title':
        suggested++;
        if (!draft.title.trim()) {
          const v = value.slice(0, 80);
          suggestions.push({
            key: 'title',
            label: 'Title',
            value: v,
            evidence: c.evidence.detail,
            patch: { title: v },
            clears: ['title'],
            status: 'pending',
          });
          basisSources.add(c.evidence.source);
        }
        break;
      case 'brand':
        suggested++;
        if (!draft.brand.trim()) {
          const v = value.slice(0, 50);
          suggestions.push({
            key: 'brand',
            label: 'Brand',
            value: v,
            evidence: c.evidence.detail,
            patch: { brand: v },
            status: 'pending',
          });
          basisSources.add(c.evidence.source);
        }
        break;
      case 'category': {
        suggested++;
        if (draft.category) break;
        const canonical =
          canonicalCategoryId(value) ||
          taxonomy.categories.find(
            (n: TaxonomyNode) => n.parentId === null && n.name.toLowerCase() === value.toLowerCase(),
          )?.id ||
          '';
        if (canonical) {
          suggestedCategoryId = canonical;
          suggestions.push({
            key: 'category',
            label: 'Category',
            value: categoryNodeName(taxonomy.categories, canonical) ?? value,
            evidence: c.evidence.detail,
            patch: { category: canonical, subcategory: '', size: '' },
            clears: ['category'],
            status: 'pending',
          });
          basisSources.add(c.evidence.source);
        }
        break;
      }
      case 'size': {
        suggested++;
        if (draft.size) break;
        const match = SIZE_OPTIONS.find(
          (s) => s.toLowerCase() === value.toLowerCase(),
        );
        if (match) {
          suggestions.push({
            key: 'size',
            label: 'Size',
            value: match,
            evidence: c.evidence.detail,
            patch: { size: match },
            clears: ['size'],
            status: 'pending',
          });
          basisSources.add(c.evidence.source);
        }
        break;
      }
      case 'condition': {
        suggested++;
        const mapped = CONDITION_CANDIDATE_MAP[value.toLowerCase()];
        if (
          !draft.condition &&
          c.evidence.source === 'seller_notes' &&
          mapped &&
          conditionAllowedFor(
            suggestedCategoryId || draft.category,
            suggestedCategoryId ? '' : draft.subcategory,
            mapped,
          )
        ) {
          suggestions.push({
            key: 'condition',
            label: 'Condition',
            value: mapped,
            evidence: c.evidence.detail,
            patch: { condition: mapped },
            clears: ['condition'],
            status: 'pending',
          });
          basisSources.add(c.evidence.source);
        }
        break;
      }
      case 'color': {
        suggested++;
        suggestions.push({
          key: 'color',
          label: 'Colour',
          value,
          evidence: c.evidence.detail,
          status: 'pending',
        });
        basisSources.add(c.evidence.source);
        break;
      }
      default:
        break;
    }
  }

  const basis = [...basisSources]
    .map((s) =>
      s === 'filename'
        ? 'the photo filename'
        : s === 'seller_notes'
          ? 'your description'
          : s === 'category_hint'
            ? 'your category'
            : 'the photos',
    )
    .join(' and ');

  return { suggestions, suggested, basis };
}
