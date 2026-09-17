import React from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { CreatorInitialMedia } from '../../navigation/types';

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

interface CreatorStudioRouteParams {
  type?: 'look' | 'poster' | 'moodboard';
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  initialMediaUri?: string;
  initialMedia?: CreatorInitialMedia[];
  startBlank?: boolean;
  openTemplates?: boolean;
}

export function CreatorStudioScreen() {
  const route = useRoute<RouteProp<{ params: CreatorStudioRouteParams }, 'params'>>();
  const initialType: 'look' | 'poster' | 'moodboard' =
    route.params?.type === 'poster'
      ? 'poster'
      : route.params?.type === 'moodboard'
      ? 'moodboard'
      : 'look';
  const [activeType, setActiveType] = React.useState<'look' | 'poster' | 'moodboard'>(initialType);
  const draftId = route.params?.draftId;
  const templateId = route.params?.templateId;
  const sourceDocumentId = route.params?.sourceDocumentId;
  const initialMediaUri = route.params?.initialMediaUri;
  const initialMedia = route.params?.initialMedia;
  const startBlank = route.params?.startBlank;
  const openTemplates = route.params?.openTemplates;

  // React Navigation can update params without remounting this shell. Keep
  // the dispatch owner aligned with an explicit route intent while allowing
  // the entry switch to change it locally between route updates.
  React.useEffect(() => {
    setActiveType(initialType);
  }, [initialType]);

  // ── Look V3: dedicated collage-native workspace ──────────────────
  // Per spec 10 (Look Architecture V3), Look gets its own screen that
  // expresses the spatial collage mental model — not a shared editor
  // with isLook branching. The LookComposerScreen wraps itself in
  // CreatorProvider, so we return it directly for Look documents.
  if (activeType === 'look') {
    const { LookComposerScreen } = require('../look/LookComposerScreen');
    return (
      <LookComposerScreen
        draftId={draftId}
        templateId={templateId}
        sourceDocumentId={sourceDocumentId}
        initialMediaUri={initialMediaUri}
        initialMedia={initialMedia}
        startBlank={startBlank}
        openTemplates={openTemplates}
        onEntryTypeChange={setActiveType}
      />
    );
  }

  // ── Poster V3: dedicated frame-native composer ──────────────────
  // Per spec 09 (Poster Architecture V3), Poster gets its own screen
  // that expresses the temporal frame mental model. The
  // PosterComposerScreen wraps itself in CreatorProvider, so we return
  // it directly for Poster documents.
  if (activeType === 'poster') {
    const { PosterComposerScreen } = require('../poster/PosterComposerScreen');
    return (
      <PosterComposerScreen
        draftId={draftId}
        templateId={templateId}
        sourceDocumentId={sourceDocumentId}
        initialMediaUri={initialMediaUri}
        initialMedia={initialMedia}
        startBlank={startBlank}
        openTemplates={openTemplates}
        onEntryTypeChange={setActiveType}
      />
    );
  }

  // ── Moodboard: dedicated editorial collage & curation workspace ────
  // Integrates Moodboard directly into the Creator Studio department so users
  // can author themed collages and post them seamlessly to poster stories / feeds.
  if (activeType === 'moodboard') {
    const MoodboardEditorScreen = require('../../screens/MoodboardEditorScreen').default;
    return <MoodboardEditorScreen />;
  }

  return null;
}
