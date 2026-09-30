import { useEffect, useRef, useState, type RefObject } from 'react';
import { useChatDrafts } from '../useChatDrafts';

/**
 * Edit-stash entry — what the composer held when a new edit was staged.
 * A plain draft stores just its text; an in-progress edit stores the
 * message id, its original body (the edit bar's preview line) and the
 * in-progress replacement text, so leaving the newer edit resumes it.
 */
type EditStashEntry =
  | { kind: 'draft'; text: string }
  | { kind: 'edit'; id: string; banner: string; text: string };

interface UseComposerEditStashOptions {
  threadId: string | undefined;
  editTarget: { id: string; text: string } | null | undefined;
  onCancelEdit: (() => void) | undefined;
  value: string;
  setValue: (value: string) => void;
  setStagedAttachment: (attachment: null) => void;
  grow: () => void;
  areaRef: RefObject<HTMLTextAreaElement | null>;
}

export function useComposerEditStash({
  threadId,
  editTarget,
  onCancelEdit,
  value,
  setValue,
  setStagedAttachment,
  grow,
  areaRef,
}: UseComposerEditStashOptions) {
  const setDraft = useChatDrafts((s) => s.setDraft);
  // An edit resumed from the stash — the parent's staging is already
  // clear for it, so the composer tracks it locally. `text` here is the
  // original body (the edit bar's preview), matching editTarget's shape.
  const [resumedEdit, setResumedEdit] = useState<{ id: string; text: string } | null>(null);
  const activeEdit = editTarget ?? resumedEdit;

  // Entering edit mode prefills the textarea with the message body and
  // focuses it; a staged photo is dropped (edits are text-only). The
  // composer's prior contents are pushed onto a stash stack — a plain
  // draft pushes { kind: 'draft' }, an in-progress edit pushes
  // { kind: 'edit' } — so A → B → end resumes A's edit rather than
  // silently replacing the stashed draft. The current draft is read
  // through a ref so the effect deps stay honest.
  const editStash = useRef<EditStashEntry[]>([]);
  const stagedEditId = useRef<string | null>(null);
  const stagedEditBanner = useRef('');
  const valueRef = useRef(value);
  valueRef.current = value;

  // Thread switch — the sanctioned derive-state-on-prop-change reset:
  // stash entries and a resumed edit reference message ids from the
  // conversation they came from; carrying them into a new thread would
  // edit the wrong message, so the local edit state clears in render.
  // The draft store read + grow/focus frames live in the effect below —
  // a render can't own an external-store read or an uncancellable rAF.
  const stashThread = useRef(threadId);
  if (stashThread.current !== threadId) {
    stashThread.current = threadId;
    editStash.current = [];
    stagedEditId.current = null;
    stagedEditBanner.current = '';
    if (resumedEdit) setResumedEdit(null);
  }

  // Draft restore + thread switch — mount runs this once for the initial
  // draft restore + desktop autofocus; a threadId change re-runs it with
  // the new thread's stored draft ("draft stays with its conversation").
  // Pending frame ids are tracked so a rapid switch or unmount cancels
  // them instead of firing a stale frame into the next thread.
  // Draft restore + thread switch — mount runs this once for the initial
  // draft restore + desktop autofocus; a threadId change re-runs it with
  // the new thread's stored draft ("draft stays with its conversation").
  // Pending frame ids are tracked so a rapid switch or unmount cancels
  // them instead of firing a stale frame into the next thread.
  const draftRafIds = useRef<number[]>([]);
  useEffect(() => {
    const raf = (fn: () => void) => {
      const id = requestAnimationFrame(() => {
        draftRafIds.current = draftRafIds.current.filter((x) => x !== id);
        fn();
      });
      draftRafIds.current.push(id);
    };
    const nextDraft = threadId
      ? (useChatDrafts.getState().drafts[threadId] ?? '')
      : '';
    if (nextDraft !== valueRef.current) {
      setValue(nextDraft);
      raf(grow);
    }
    // Desktop grammar — opening a thread puts the caret in the composer
    // (Messenger web); touch viewports skip it so no keyboard pops.
    // Desktop grammar — opening a thread puts the caret in the composer
    // (Messenger web); touch viewports skip it so no keyboard pops.
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      raf(() => areaRef.current?.focus());
    }
    return () => {
      draftRafIds.current.forEach((id) => cancelAnimationFrame(id));
      draftRafIds.current = [];
    };
  }, [threadId, grow, setValue, areaRef]);

  useEffect(() => {
    const activeId = activeEdit?.id ?? null;
    if (stagedEditId.current === activeId) return;
    const focusComposer = () =>
      requestAnimationFrame(() => {
        grow();
        const el = areaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    if (activeEdit) {
      // A fresh parent-staged edit (resumed edits short-circuit above —
      // the pop already set stagedEditId to the resumed id).
      editStash.current.push(
        stagedEditId.current === null
          ? { kind: 'draft', text: valueRef.current }
          : {
              kind: 'edit',
              id: stagedEditId.current,
              banner: stagedEditBanner.current,
              text: valueRef.current,
            },
      );
      stagedEditId.current = activeEdit.id;
      stagedEditBanner.current = activeEdit.text;
      setValue(activeEdit.text);
      setStagedAttachment(null);
      focusComposer();
      return;
    }
    // The active edit ended — pop the stash. An interrupted edit resumes
    // composer-side (the parent's staging is already clear); a plain
    // draft restores as text.
    stagedEditId.current = null;
    stagedEditBanner.current = '';
    const entry = editStash.current.pop();
    if (entry?.kind === 'edit') {
      stagedEditId.current = entry.id;
      stagedEditBanner.current = entry.banner;
      setResumedEdit({ id: entry.id, text: entry.banner });
      setValue(entry.text);
      focusComposer();
    } else {
      setResumedEdit(null);
      setValue(entry?.text ?? '');
      // The restored draft re-asserts itself in the store — an edit
      // staged over it never overwrote the draft slot.
      if (threadId) setDraft(threadId, entry?.text ?? '');
      requestAnimationFrame(grow);
    }
  }, [activeEdit, grow, threadId, setDraft, setValue, setStagedAttachment, areaRef]);

  // × / Escape end the staged edit — a stash-resumed edit isn't in the
  // parent's staging, so clearing it locally unwinds the stash the same
  // way a parent-driven cancel does.
  const cancelEdit = () => {
    if (resumedEdit) setResumedEdit(null);
    onCancelEdit?.();
  };

  const clearResumed = () => {
    if (resumedEdit) setResumedEdit(null);
  };

  return {
    activeEdit,
    cancelEdit,
    clearResumed,
  };
}
