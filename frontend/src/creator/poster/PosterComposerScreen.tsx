import React from 'react';
import { useRoute } from '@react-navigation/native';
import { CreatorProvider } from '../CreatorContext';
import { CreatorStudioInner } from '../CreatorStudioShell';
import type { CreatorInitialMedia } from '../../navigation/types';

// ───────────────────────────────────────────────────────────────────────────
// Poster Composer V3 — Frame-Native Composer (spec 09)
//
// Poster is temporal: a sequence of frames. The composer shows ONE
// current frame filling the screen, with frame navigation appearing
// only because there are multiple frames — not because "page
// management" is a permanent toolbar concept.
//
// Default chrome: close, Next, media-specific sound/clip control,
// contextual actions (Text, Stickers, Product, Draw, More).
//
// Frame overview (filmstrip) is invoked intentionally for reorder,
// delete, duplicate, add, select — it does not permanently occupy
// the canvas.
//
// Layers, Safe zone, Z-index, Page duration, Opacity and template
// management live in More/Advanced, not the first-run path.
//
// This screen wraps the existing CreatorStudioInner (which has the
// full Poster editing logic) in a CreatorProvider seeded for Poster.
// The frame-native UX refinement is an ongoing pass per spec 09.
// ───────────────────────────────────────────────────────────────────────────

export function PosterComposerScreen(props: {
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  initialMediaUri?: string;
  initialMedia?: CreatorInitialMedia[];
  startBlank?: boolean;
  openTemplates?: boolean;
}) {
  return (
    <CreatorProvider
      initialType="poster"
      draftId={props.draftId}
      templateId={props.templateId}
      sourceDocumentId={props.sourceDocumentId}
      initialMediaUri={props.initialMediaUri}
      initialMedia={props.initialMedia}
    >
      <CreatorStudioInner />
    </CreatorProvider>
  );
}
