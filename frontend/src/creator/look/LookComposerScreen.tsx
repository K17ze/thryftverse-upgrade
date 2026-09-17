import React from 'react';
import type { CreatorInitialMedia } from '../../navigation/types';
import { useLookComposerController } from './composer/useLookComposerController';
import { LookComposerWorkspace } from './composer/LookComposerWorkspace';

// ── Look Composer V3 — Collage-Native Workspace ───────────────────────
// Per spec 10 (Look Architecture V3):
//   Poster is temporal. Look is spatial.
//   This screen is a dedicated collage-native workspace — NOT a shared
//   editor with isPoster/isLook branching. The mental model is direct
//   object manipulation on a 4:5 canvas.
//
// Canvas:
//   - 4:5 primary canvas (LOOK_DEFAULT_ASPECT_RATIO = 0.8)
//   - neutral workspace (dark, not full-bleed story)
//   - direct object manipulation via CreatorCanvas
//
// Default bottom actions (spec 10):
//   Add item · Add photo · Crop · Text · Layout
//
// Selected object produces a context toolbar (not a permanent dock).
// Global Layers remains More/Advanced.

// ── Bottom surface state machine ───────────────────────────────────────
// Per spec: "One lower interaction surface at a time." The Look screen
// shows exactly ONE bottom surface at any moment. The default is 'tools'
// (the ContextToolRail). Tapping "Items" / "Layout" / "Effects" swaps
// the bottom surface to that panel; closing the panel returns to 'tools'.
// This replaces the old pattern of multiple permanent rails (AutoLayoutBar,
// LayoutPreviewRail, LookSourceTray) competing with the canvas.
// BottomSurface type moved to composer/LookBottomSurfaces.tsx.

// ── SlideUpSurface — moved to composer/SlideUpSurface.tsx ──
// Per spec: "Reanimated for surface transitions (slide in/out)." Each
// bottom surface (items, layout, effects) slides up from below when it
// mounts. Under reduced motion, the transition is instant.
// Per §5.14: entrance uses timing (ease-out), not spring — spring is
// reserved for direct manipulation or mode selection.

// ── Composer internals ─────────────────────────────────────────────────
// State, handlers, effects and derived data live in
// composer/useLookComposerController.ts (which composes the per-domain
// hooks under composer/). JSX lives in composer/LookComposerWorkspace.tsx.
// This file is the thin shell: controller → workspace.

function LookComposerInner({ onEntryTypeChange }: { onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void }) {
  const vm = useLookComposerController();
  return <LookComposerWorkspace vm={vm} onEntryTypeChange={onEntryTypeChange} />;
}

// LayoutPanel moved to composer/LookLayoutPanel.tsx.

// ── Screen — wraps in CreatorProvider (shared state) ───────────────────
// This is the full screen with CreatorProvider. It is used by the
// CreatorStudioScreen wrapper in CreatorStudioShell which branches on
// document type. The wrapper there passes route params to this component.
export function LookComposerScreen(props: {
  draftId?: string;
  templateId?: string;
  sourceDocumentId?: string;
  initialMediaUri?: string;
  initialMedia?: CreatorInitialMedia[];
  startBlank?: boolean;
  openTemplates?: boolean;
  onEntryTypeChange: (type: 'look' | 'poster' | 'moodboard') => void;
}) {
  // Lazy import to avoid circular dependency at module load time
  const { CreatorProvider } = require('../studio/CreatorContext');
  return (
    <CreatorProvider
      initialType="look"
      draftId={props.draftId}
      templateId={props.templateId}
      sourceDocumentId={props.sourceDocumentId}
      initialMediaUri={props.initialMediaUri}
      initialMedia={props.initialMedia}
    >
      <LookComposerInner onEntryTypeChange={props.onEntryTypeChange} />
    </CreatorProvider>
  );
}

// Styles moved to LookComposerStyles.ts (imported as `styles` above).
