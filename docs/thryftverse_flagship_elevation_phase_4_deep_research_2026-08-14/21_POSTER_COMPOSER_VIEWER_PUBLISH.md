# Poster — frame composer, viewer and publish

## Code surfaces inspected / affected

- `frontend/src/creator/poster/PosterComposerScreen.tsx`
- `frontend/src/creator/poster/PosterComposerParts.tsx`
- `frontend/src/creator/CreatorPublishSheet.tsx`
- `frontend/src/screens/PosterViewerScreen.tsx`

## Current diagnosis


Poster is now a dedicated frame-native product. Phase 3.1 truthfully marks trim/mute as future rather than presenting fake controls. Phase 4 should improve creator feel without reintroducing unavailable functionality.

The remote publish sheet already demonstrates a good direction: it replaced multi-stage progress theatre with `Sharing…` and a quiet success.


## User psychology / product job


Poster has two modes:
- temporal sequence management;
- direct editing of current frame.

The user should never feel they are manipulating an abstract document model.


## Flagship target composition


Composer:
- one frame fills canvas;
- close / undo / Next;
- contextual bottom tools;
- frame overview only when requested/needed.

Viewer:
- full-screen media;
- lightweight progress;
- tap next/prev;
- hold pause;
- swipe down close;
- reply/reaction where applicable.


## Detailed implementation map


1. Keep unavailable video trim/mute clearly non-interactive and compact; do not make it a prominent toolbar item.
2. Frame tray:
   - don't auto-open on every frame change after the first discoverability moment;
   - use small frame-count/overview affordance.
3. Selected layer switches toolbar to object-specific actions; hide global tool rail.
4. Text editing happens on canvas with keyboard-sticky style controls.
5. Product tags are hotspots/compact stickers, not mini commerce cards covering media.
6. Frame reorder uses drag with thumbnail lift.
7. Frame deletion has undo; no confirmation dialog for easily reversible action.
8. Draft save remains background; back asks only when persistence state genuinely requires it.
9. Publish review shows:
   - audience;
   - caption;
   - optional sharing/scheduling;
   not implementation settings.
10. Publish progress stays one quiet `Sharing…`.
11. Success navigates directly to the new object; “create another” remains secondary.
12. Viewer reactions do not permanently cover media; composer remains keyboard-integrated.


## Micro-detail pass


- Tool label visible only where icon ambiguity is high.
- Use white-on-media chrome with accessible scrim.
- Safe-zone overlay remains advanced.
- Avoid gold accents on creator controls unless brand-selected state; media should supply color.


## Acceptance / screenshot QA


Pass:
- a first-time user can make a 3-frame Poster without opening Layers/Safe Zone/Templates.
- no fake editing capability.
- viewer has no excessive chrome at rest.


## Reference crosswalk


- Snapchat Multi Snap / Timeline Editor for temporal mental model.
- Instagram/Instants for minimal viewer/capture chrome.
