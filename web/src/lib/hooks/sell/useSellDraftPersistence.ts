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
 *  - blob: photo URLs are session-scoped and never persisted; remote URLs
 *    (edit-mode listing media) round-trip fine
 *
 * Storage shape (versioned):
 *   { version: 1, savedAt: ISO, editId: string | null, ...draft fields }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ListingCondition } from '@/lib/contracts/domain';
import { EMPTY_DRAFT, type SellDraft } from '@/components/sell/constants';

export const SELL_DRAFT_STORAGE_KEY = 'thryftverse.sell-draft';

const SAVE_DEBOUNCE_MS = 600;
const SAVED_FLASH_MS = 1600;

export interface PersistedSellDraft {
  version: 1;
  savedAt: string;
  /** Listing the draft was editing, when saved from the ?edit= flow. */
  editId: string | null;
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
  shippingMethod: string;
  shippingPayer: string;
}

export function toPersistedDraft(draft: SellDraft, editId: string | null): PersistedSellDraft {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    editId,
    // blob: URLs are revoked with the session — persisting them would
    // restore dead images. Remote fixture/CDN URLs survive.
    photos: draft.photos.filter((u) => !u.startsWith('blob:')),
    title: draft.title,
    brand: draft.brand,
    category: draft.category,
    subcategory: draft.subcategory,
    condition: draft.condition,
    size: draft.size,
    description: draft.description,
    tags: [...draft.tags],
    price: draft.price,
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
      record.price.trim(),
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

interface UseSellDraftPersistenceOptions {
  draft: SellDraft;
  /** Listing id when authoring through ?edit=<id>, else null. */
  editId: string | null;
  /**
   * True once the user has touched the form this mount. While a saved draft
   * is awaiting the resume/discard decision, auto-save stays quiet so the
   * pristine initial state never overwrites it.
   */
  dirty: boolean;
}

export function useSellDraftPersistence({ draft, editId, dirty }: UseSellDraftPersistenceOptions) {
  const [pendingDraft, setPendingDraft] = useState<PersistedSellDraft | null>(null);
  const [draftSavedVisible, setDraftSavedVisible] = useState(false);

  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialMountRef = useRef(true);
  // Set by clearPersistedDraft (publish/abandon) so the unmount flush never
  // resurrects a draft whose job is done. Cleared when the user edits again.
  const clearedRef = useRef(false);
  const draftRef = useRef(draft);
  const editIdRef = useRef(editId);
  const dirtyRef = useRef(dirty);
  const pendingRef = useRef(pendingDraft);
  draftRef.current = draft;
  editIdRef.current = editId;
  dirtyRef.current = dirty;
  pendingRef.current = pendingDraft;

  /* -- surface a saved draft once on mount -- */
  useEffect(() => {
    const record = loadSellDraft();
    if (hasDraftContent(record)) setPendingDraft(record);
  }, []);

  const writeNow = useCallback(() => {
    const record = toPersistedDraft(draftRef.current, editIdRef.current);
    if (hasDraftContent(record)) writeSellDraft(record);
    else clearSellDraft();
  }, []);

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
    setPendingDraft(null);
    clearSellDraft();
  }, []);

  /** "Save draft & exit" — bypass the debounce and persist immediately. */
  const flushDraft = useCallback(() => {
    setPendingDraft(null);
    writeNow();
  }, [writeNow]);

  /** Publish / abandon — the draft's job is done. */
  const clearPersistedDraft = useCallback(() => {
    clearedRef.current = true;
    setPendingDraft(null);
    clearSellDraft();
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
