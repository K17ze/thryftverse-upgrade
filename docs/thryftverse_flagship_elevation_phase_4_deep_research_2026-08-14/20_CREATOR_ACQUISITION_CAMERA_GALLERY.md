# Creator acquisition — Camera and Gallery

## Code surfaces inspected / affected

- `frontend/src/screens/CreateCameraScreen.tsx`
- `frontend/src/creator/CreatorCamera.tsx`
- `frontend/src/creator/CreatorEntryScreen.tsx`
- `frontend/src/creator/camera/*`

## Current diagnosis


The camera is now technically healthier: tap photo / hold video, normalized zoom, true batch retention, tools disclosure and truthful focus. The current remote still uses `expo-media-library/legacy` and carries many camera behaviors.

Flagship opportunity is to simplify the visible capture moment.


## User psychology / product job


Camera psychology is immediate:
- frame;
- capture;
- decide.

Every visible tool before capture taxes confidence. Snapchat/Instagram use progressive tool disclosure because the media itself must dominate.


## Flagship target composition


Default camera chrome:
- close;
- flash;
- flip;
- shutter;
- gallery thumbnail;
- one Tools disclosure.

Gestures:
- tap shutter photo;
- hold video;
- double-tap viewfinder flip if retained;
- pinch zoom.

Timer/grid/multi-capture behind Tools.


## Detailed implementation map


1. Remove any second permanent Photo/Video/Boomerang mode deck if tap/hold interaction is reliable.
2. Clearly show capture mode `Poster` or `Look` only when needed; not a large tab row.
3. Gallery picker uses ordered selection with index badges and reorder tray.
4. Poster selected media becomes frames; Look becomes composition sources.
5. Use modern scoped picker/library APIs where possible; avoid broad media permission when not necessary.
6. First permission experience explains only camera need; gallery permission requested when gallery is used.
7. Quick review:
   - Retake;
   - Use;
   editing happens in target composer.
8. Multi-capture ends in frame review, not another editor.
9. Video recording displays truthful elapsed time and one stop affordance.
10. Zoom labels must not imply optical lenses unless actual device lens selection is implemented.


## Micro-detail pass


- Viewfinder black edge-to-edge.
- Tool glyphs use simple translucent hit areas, no permanent circles behind all icons.
- Gradients only top/bottom legibility scrims.
- Gallery thumbnail 48–56 visible size; 44+ hit.
- Focus reticle fades quickly.


## Acceptance / screenshot QA


Devices:
- camera permission denied;
- limited photos;
- front/back;
- low light;
- video;
- multi;
- interrupted recording;
- orientation/compact Android.

Pass:
- at rest, user sees ≤6 meaningful controls.


## Reference crosswalk


- Instagram Instants: camera opens directly and removes pre-share complexity.
- Snapchat Multi Snap: capture first, review frames individually.
- Snapchat Quick Cut: fewer steps from media selection.
