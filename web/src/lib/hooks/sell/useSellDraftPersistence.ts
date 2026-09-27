'use client';

/**
 * useSellDraftPersistence — localStorage-backed draft save/resume for the
 * web sell flow. Web-shaped port of the mobile
 * hooks/sell/useSellDraftPersistence.ts contract:
 *
 *  - debounced auto-save of the whole flat draft on change
 *  - a transient "Saved" indicator after each write (mobile: draftSavedVisible)
 *  - a pending snapshot surfaced to the screen as a Resume banner instead of
 *    being silently applied — the web route is shareable, so the draft is a
 *    decision, not ambient state
 *  - blob: photo refs ARE persisted (they still resolve on same-session
 *    resumes); dead refs are validated out on resume and counted so the
 *    screen can show an honest "re-add these photos" notice rather than
 *    silently dropping them
 *  - every record carries a draftId binding it to the seller-hub draft
 *    shelf (MY_DRAFT_LISTINGS) or the catalog-import draft store — one
 *    draft, resumable from either surface
 *
 * Storage shape (versioned):
 *   { version: 1, savedAt: ISO, editId: string | null,
 *     draftId: string | null, ...draft fields }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Listing, ListingCondition, User } from '@/lib/contracts/domain';
import { EMPTY_DRAFT, parsePriceInput, type SellDraft } from '@/components/sell/constants';

export const SELL_DRAFT_STORAGE_KEY = 'thryftverse.sell-draft';

const SAVE_DEBOUNCE_MS = 600;
const SAVED_FLASH_MS = 1600;

export interface PersistedSellDraft {
  version: 1;
  savedAt: string;
  /** Listing the draft was editing, when saved from the ?edit= flow. */
  editId: string | null;
  /**
   * The seller-draft record this snapshot belongs to — a hub shelf row
   * (MY_DRAFT_LISTINGS), an imported draft, or the id generated on the
   * first save of a composer draft. Null in edit mode and for records
   * written before drafts unified across surfaces.
   */
  draftId?: string | null;
  photos: string[];
  title: string;
  brand: string;
  category: string;
  subcategory: string;
  condition: string;
  size: string;
  description: string;
  tags: string[];
  price: string;
  /** RRP/"was" price — Listing.originalPrice (wire: originalPriceGbp). */
  originalPrice: string;
  /** Seller-asserted sustainability attributes (native SustainabilityTags
   *  parity) — claims, not platform-verified facts. */
  sustainabilityTags?: string[];
  shippingMethod: string;
  shippingPayer: string;
}

export function toPersistedDraft(
  draft: SellDraft,
  editId: string | null,
  draftId: string | null,
): PersistedSellDraft {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    editId,
    draftId,
    // blob: refs are kept — they still resolve within the session that
    // created them, so navigating away and back keeps previews. Refs dead
    // after a reload are filtered on resume via livePhotosOnly().
    photos: [...draft.photos],
    title: draft.title,
    brand: draft.brand,
    category: draft.category,
    subcategory: draft.subcategory,
    condition: draft.condition,
    size: draft.size,
    description: draft.description,
    tags: [...draft.tags],
    price: draft.price,
    originalPrice: draft.originalPrice,
    sustainabilityTags: [...draft.sustainabilityTags],
    shippingMethod: draft.shippingMethod,
    shippingPayer: draft.shippingPayer,
  };
}

export function draftFromPersisted(record: PersistedSellDraft): SellDraft {
  return {
    ...EMPTY_DRAFT,
    photos: record.photos ?? [],
    title: record.title ?? '',
    brand: record.brand ?? '',
    category: record.category ?? '',
    subcategory: record.subcategory ?? '',
    condition: (record.condition || '') as ListingCondition | '',
    size: record.size ?? '',
    description: record.description ?? '',
    tags: record.tags ?? [],
    price: record.price ?? '',
    originalPrice: record.originalPrice ?? '',
    sustainabilityTags: record.sustainabilityTags ?? [],
    shippingMethod: (record.shippingMethod || '') as SellDraft['shippingMethod'],
    shippingPayer: (record.shippingPayer || '') as SellDraft['shippingPayer'],
  };
}

/** A record worth offering to resume — any authored field beyond a bare draft. */
export function hasDraftContent(record: PersistedSellDraft | null): record is PersistedSellDraft {
  if (!record) return false;
  return Boolean(
    record.editId ||
      record.photos.length ||
      record.title.trim() ||
      record.brand.trim() ||
      record.category ||
      record.subcategory ||
      record.condition ||
      record.size ||
      record.description.trim() ||
      record.tags.length ||
      record.price.trim() ||
      (record.originalPrice ?? '').trim() ||
      (record.sustainabilityTags?.length ?? 0),
  );
}

export function loadSellDraft(): PersistedSellDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SELL_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSellDraft;
    return parsed && parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeSellDraft(record: PersistedSellDraft) {
  try {
    window.localStorage.setItem(SELL_DRAFT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage full / private mode — drafts are a convenience, not a failure.
  }
}

export function clearSellDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SELL_DRAFT_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Resume-time photo check — blob: URLs only live as long as the document
 * that created them. Same-session resumes keep their previews; after a
 * reload the dead refs are filtered out and counted so the caller can
 * surface an honest notice instead of silently dropping photos.
 */
export async function livePhotosOnly(
  urls: string[],
): Promise<{ kept: string[]; dropped: number }> {
  const alive = await Promise.all(
    urls.map(async (url) => {
      if (!url.startsWith('blob:')) return true;
      try {
        const res = await fetch(url);
        return res.ok;
      } catch {
        return false;
      }
    }),
  );
  const kept = urls.filter((_, i) => alive[i]);
  return { kept, dropped: urls.length - kept.length };
}

/**
 * Project a persisted draft onto a seller-hub draft Listing — the shelf
 * record the management table renders. Condition needs a contract value;
 * publish still requires the explicit pick, this is only the private
 * shelf copy.
 */
export function draftRecordToListing(record: PersistedSellDraft, seller: User): Listing {
  const originalPrice = parsePriceInput(record.originalPrice ?? '');
  return {
    id: record.draftId ?? `sd-${Date.now().toString(36)}`,
    title: record.title.trim() || 'Untitled draft',
    brand: record.brand.trim() || null,
    size: record.size || null,
    condition: (record.condition || 'Good') as ListingCondition,
    price: parsePriceInput(record.price) ?? 0,
    // Contract field — carried through so a resumed draft keeps its RRP.
    originalPrice: originalPrice ?? undefined,
    images: [...record.photos],
    likes: 0,
    views: 0,
    sellerId: seller.id,
    seller: {
      id: seller.id,
      username: seller.username,
      avatar: seller.avatar,
      rating: seller.rating,
      reviewCount: seller.reviewCount,
      verified: seller.isVerified,
    },
    category: record.category || 'uncategorised',
    subcategory: record.subcategory || null,
    description: record.description.trim(),
    createdAt: record.savedAt,
    status: 'draft',
    shippingMethod: record.shippingMethod || null,
    shippingPayer: record.shippingPayer || null,
    // Seller-asserted claims ride outside the shared contract — the same
    // extension-field pattern `tags` uses elsewhere in the sell flow.
    ...({
      sustainabilityTags: [...(record.sustainabilityTags ?? [])],
    } as { sustainabilityTags?: string[] }),
  };
}

interface UseSellDraftPersistenceOptions {
  draft: SellDraft;
  /** Listing id when authoring through ?edit=<id>, else null. */
  editId: string | null;
  /** Seller-draft id when composing a shelf/import draft (?draft=<id>). */
  draftId?: string | null;
  /**
   * True once the user has touched the form this mount. While a saved draft
   * is awaiting the resume/discard decision, auto-save stays quiet so the
   * pristine initial state never overwrites it.
   */
  dirty: boolean;
  /**
   * Reconciliation hook — invoked after every persisted write with the
   * record, and with `null` whenever the stored draft is cleared (emptied,
   * discarded or published). Lets the owner keep the seller-hub shelf and
   * the import store in sync with the localStorage snapshot.
   */
  onWriteRecord?: (record: PersistedSellDraft | null, draftId: string | null) => void;
}

export function useSellDraftPersistence({
  draft,
  editId,
  draftId,
  dirty,
  onWriteRecord,
}: UseSellDraftPersistenceOptions) {
  const [pendingDraft, setPendingDraft] = useState<PersistedSellDraft | null>(null);
  const [draftSavedVisible, setDraftSavedVisible] = useState(false);

  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMountRef = useRef(true);
  // Set by clearPersistedDraft (publish/abandon) so the unmount flush never
  // resurrects a draft whose job is done. Cleared when the user edits again.
  const clearedRef = useRef(false);
  // Composer drafts get a shelf id on first save so subsequent autosaves
  // update the same hub row instead of forking it.
  const generatedDraftIdRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  const editIdRef = useRef(editId);
  const draftIdRef = useRef(draftId);
  const dirtyRef = useRef(dirty);
  const pendingRef = useRef(pendingDraft);
  const onWriteRef = useRef(onWriteRecord);
  draftRef.current = draft;
  editIdRef.current = editId;
  draftIdRef.current = draftId;
  dirtyRef.current = dirty;
  pendingRef.current = pendingDraft;
  onWriteRef.current = onWriteRecord;

  /* -- surface a saved draft once on mount -- */
  useEffect(() => {
    const record = loadSellDraft();
    if (hasDraftContent(record)) setPendingDraft(record);
  }, []);

  const currentDraftId = useCallback((): string | null => {
    if (editIdRef.current) return null;
    if (draftIdRef.current) return draftIdRef.current;
    if (!generatedDraftIdRef.current) {
      generatedDraftIdRef.current = `sd-${Date.now().toString(36)}-${Math.floor(
        Math.random() * 1_000_000,
      ).toString(36)}`;
    }
    return generatedDraftIdRef.current;
  }, []);

  const writeNow = useCallback(() => {
    const record = toPersistedDraft(draftRef.current, editIdRef.current, currentDraftId());
    const recordDraftId = record.draftId ?? null;
    if (hasDraftContent(record)) {
      writeSellDraft(record);
      onWriteRef.current?.(record, recordDraftId);
    } else {
      clearSellDraft();
      onWriteRef.current?.(null, recordDraftId);
    }
  }, [currentDraftId]);

  /* -- debounced auto-save on draft change -- */
  useEffect(() => {
    // Skip the mount pass (mirrors mobile's isInitialMountRef) — restoring
    // state isn't an edit, and must not flash "Saved" or overwrite a pending
    // snapshot before the user decides.
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (pendingDraft) {
      if (!dirty) return;
      // The user started typing over the banner — the live draft wins.
      setPendingDraft(null);
    }
    // A real edit after publish/abandon re-arms persistence.
    clearedRef.current = false;
    const timer = window.setTimeout(() => {
      writeNow();
      setDraftSavedVisible(true);
      if (flashRef.current) clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setDraftSavedVisible(false), SAVED_FLASH_MS);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, editId, dirty, pendingDraft, writeNow]);

  /* -- flush on unmount so a fast exit never loses the last keystroke -- */
  useEffect(
    () => () => {
      if (flashRef.current) clearTimeout(flashRef.current);
      if (dirtyRef.current && !pendingRef.current && !clearedRef.current) writeNow();
    },
    [writeNow],
  );

  /** Applies nothing itself — returns the stored draft for the owner to set. */
  const resumeDraft = useCallback((): SellDraft | null => {
    const record = pendingRef.current;
    if (!record) return null;
    setPendingDraft(null);
    return draftFromPersisted(record);
  }, []);

  const discardDraft = useCallback(() => {
    // The offered record's shelf id wins — discarding deletes that draft.
    const id =
      pendingRef.current?.draftId ?? draftIdRef.current ?? generatedDraftIdRef.current;
    setPendingDraft(null);
    clearSellDraft();
    onWriteRef.current?.(null, id ?? null);
  }, []);

  /** "Save draft & exit" — bypass the debounce and persist immediately. */
  const flushDraft = useCallback(() => {
    setPendingDraft(null);
    writeNow();
  }, [writeNow]);

  /** Publish / abandon — the draft's job is done. */
  const clearPersistedDraft = useCallback(() => {
    clearedRef.current = true;
    const id = draftIdRef.current ?? generatedDraftIdRef.current;
    setPendingDraft(null);
    clearSellDraft();
    onWriteRef.current?.(null, id ?? null);
  }, []);

  return {
    pendingDraft,
    draftSavedVisible,
    resumeDraft,
    discardDraft,
    flushDraft,
    clearPersistedDraft,
  };
}
