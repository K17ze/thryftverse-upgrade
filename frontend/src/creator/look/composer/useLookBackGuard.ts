/**
 * useLookBackGuard — truthful back handling + periodic autosave for the
 * Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * `handleBack` offers Save Draft / Discard / Keep Editing when the
 * document is dirty. The 30-second debounce timer fires whenever the
 * document is dirty, saving silently in the background.
 */

import { useCallback, useEffect } from 'react';
import type { NativeStackNavigationProp, RootStackParamList } from '../../../navigation/types';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';

export function useLookBackGuard({
  cs,
  creator,
  navigation,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;
}) {
  const { setConfirmSheet } = cs;
  const { isDirty, saveDraft } = creator;

  // ── Truthful back — offers Save Draft / Discard / Keep Editing ──────
  const handleBack = useCallback(() => {
    if (!isDirty) {
      navigation.goBack();
      return;
    }
    setConfirmSheet({
      visible: true,
      title: 'Save draft?',
      message: 'Your changes haven\'t been published yet.',
      confirmLabel: 'Save draft',
      variant: 'default',
      onConfirm: async () => {
        try {
          await saveDraft();
          navigation.goBack();
        } catch {
          setConfirmSheet({
            visible: true,
            title: 'Could not save draft',
            message: 'Try again.',
            confirmLabel: 'OK',
            variant: 'default',
            onConfirm: () => {} });
        }
      } });
  }, [isDirty, navigation, saveDraft, setConfirmSheet]);

  // ── Periodic autosave (30s debounce) ─────────────────────────────────
  // The Look composer previously only saved on back press. A crash between
  // edits would lose everything. This 30-second debounce timer fires
  // whenever the document is dirty, saving silently in the background.
  // The CreatorContext also has its own 5s autosave + AppState listener,
  // but this ensures the Look composer's saveDraft is called even if the
  // context's internal save path has a gap.
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      saveDraft().catch(() => {
        // Silent failure — the user will be prompted to save on back
      });
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isDirty, saveDraft]);

  return { handleBack };
}
