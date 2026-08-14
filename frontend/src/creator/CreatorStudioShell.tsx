import React from 'react';
import { useRoute } from '@react-navigation/native';
import type { CreatorInitialMedia } from '../navigation/types';

// ───────────────────────────────────────────────────────────────────────────
// Creator Studio Shell — dispatch wrapper
//
// Both Look and Poster now have dedicated composers:
//   - Look   → LookComposerScreen   (src/creator/look/LookComposerScreen)
//   - Poster → PosterComposerScreen (src/creator/poster/PosterComposerScreen)
//
// This wrapper reads route params and dispatches to the correct dedicated
// composer. The legacy CreatorStudioInner has been removed.
// ───────────────────────────────────────────────────────────────────────────

export function CreatorStudioScreen() {
  const route = useRoute<any>();
  const initialType = route.params?.type === 'poster' ? 'poster' : 'look';
  const draftId = route.params?.draftId as string | undefined;
  const templateId = route.params?.templateId as string | undefined;
  const sourceDocumentId = route.params?.sourceDocumentId as string | undefined;
  const initialMediaUri = route.params?.initialMediaUri as string | undefined;
  const initialMedia = route.params?.initialMedia as CreatorInitialMedia[] | undefined;
  const startBlank = route.params?.startBlank as boolean | undefined;
  const openTemplates = route.params?.openTemplates as boolean | undefined;

  // ── Look V3: dedicated collage-native workspace ──────────────────
  // Per spec 10 (Look Architecture V3), Look gets its own screen that
  // expresses the spatial collage mental model — not a shared editor
  // with isLook branching. The LookComposerScreen wraps itself in
  // CreatorProvider, so we return it directly for Look documents.
  if (initialType === 'look') {
    const { LookComposerScreen } = require('./look/LookComposerScreen');
    return (
      <LookComposerScreen
        draftId={draftId}
        templateId={templateId}
        sourceDocumentId={sourceDocumentId}
        initialMediaUri={initialMediaUri}
        initialMedia={initialMedia}
        startBlank={startBlank}
        openTemplates={openTemplates}
      />
    );
  }

  // ── Poster V3: dedicated frame-native composer ──────────────────
  // Per spec 09 (Poster Architecture V3), Poster gets its own screen
  // that expresses the temporal frame mental model. The
  // PosterComposerScreen wraps itself in CreatorProvider, so we return
  // it directly for Poster documents.
  if (initialType === 'poster') {
    const { PosterComposerScreen } = require('./poster/PosterComposerScreen');
    return (
      <PosterComposerScreen
        draftId={draftId}
        templateId={templateId}
        sourceDocumentId={sourceDocumentId}
        initialMediaUri={initialMediaUri}
        initialMedia={initialMedia}
        startBlank={startBlank}
        openTemplates={openTemplates}
      />
    );
  }

  // Unreachable — initialType is always 'look' or 'poster' based on the
  // ternary above. Return null as a safe fallback.
  return null;
}
