# Claim vs Implementation Truth Audit

Legend: **VERIFIED**, **PARTIAL**, **STUB**, **ABSENT STANDARD BUILD**, **P0 FAIL**, **NEEDS DEVICE PROOF**.

## Context tool rail — VERIFIED foundation / visually incomplete

Verified:
- context types;
- max six primary tools;
- overflow;
- 44pt minimum path;
- pinned/recent tool integration.

Gaps:
- `ToolDefinition` has no active/selected flag;
- rail comments promise active brand color but runtime uses one neutral icon color;
- preferred 48pt path is not used by the main mapping;
- generic Ionicons are the entire editor glyph vocabulary;
- plain `Pressable` means the rail does not get the shared `PressScale` visual feedback;
- permanent 11pt labels make it read like a utility toolbar.

**Status: PARTIAL flagship control craft.**

## Asset picker decomposition — PARTIAL

New Text/Drawing/Audio/Sticker adapters exist, but `CreatorAssetPicker.tsx` remains a very large 20-mode router and still implements Media/Product/Mention/Look/Shape/Vote/GIF/Quiz/Question/EmojiSlider/Countdown/Link/Location/Hashtag/Time/Weather inline.

The refactor added architecture without completing migration.

## Drawing HEX — VERIFIED local feature

Drawing has a validated `#RRGGBB` field and presets. The user's suspicion that *no* exact HEX exists anywhere would be too broad.

However the existence of exact color in one tool highlights the system inconsistency because Text/Background use different mechanisms.

## Text color — P0 quality gap

Current text editor:
- eight swatches;
- one-dimensional hue strip;
- fixed S=80/L=55 conversion.

Missing:
- exact HEX;
- saturation/value plane;
- alpha;
- eyedropper;
- recents;
- project palette;
- media palette;
- separate stroke/background/shadow colors.

## Text Thin/Thick / Soft/Strong — semantic fidelity failure

The UI exposes distinct strengths, but they serialize to the same coarse `outline` or `shadow` enum. That means the user can select a visually named precision level that the document cannot actually preserve.

**Status: P0 schema/UI mismatch.**

## Look background — PARTIAL

Good:
- solid;
- gradient presets;
- blur;
- image tab exists.

Gaps:
- custom solid input lacks shared validation/canonicalization;
- gradients are preset-only;
- no stop editing/angle/alpha;
- Image is a disabled future placeholder.

Commit-level wording that backgrounds include a working custom Image path overstates completion.

## Native effect previews — P0 FAIL

Current effects code represents filters as CSS-like strings and explicitly notes native preview ignores the style. This means a native iOS/Android creator cannot claim WYSIWYG filter previews.

The canonical canvas media renderer also does not apply the effect stack at all.

**Status: P0 FAIL.**

## Auto Adjust — STUB relative to “intelligent” claim

`computeAutoAdjust()` takes no media input and always returns the same constants.

It is a preset, not image analysis.

Valid options:
- rename to `Enhance`; or
- implement content-aware analysis.

## Cutout — ABSENT STANDARD BUILD

`CutoutService` dynamically probes three candidate packages. None is present in current frontend dependencies.

The fallback UI honestly says unsupported, which is good. But a normal production build from the branch has no evidenced cutout backend.

## Mask refinement — STUB

`refineMask()` returns the original mask unchanged. Brush strokes are visual intent only.

## Canonical renderer — P0 advanced-property gap

Positive:
- full `compositionDocument` is persisted;
- Poster Viewer validates and reuses `CreatorCanvas`.

Critical:
- `MediaLayerContent` renders raw CachedImage/Video and does not consume media `effects` or mask references;
- no keyframe evaluator transforms layers over time;
- video is hard-coded `shouldPlay`, muted, looping.

Therefore editor/viewer share the same renderer but the renderer does not yet implement the new advanced authoring semantics.

## Poster timeline — meaningful foundation, not authoritative

Verified:
- clip type;
- trim/split/speed/volume operations;
- track/ruler/playhead/overlay/waveform components;
- transition/keyframe/speed-curve editors exist.

Critical issues:
- composer itself calls timeline a projection of the page/layer model;
- overlays are assigned whole-page ranges rather than canonical per-layer timing;
- traversal increments page offset and can break on video before reading later overlays;
- page duration can diverge from trim/speed-adjusted clip duration;
- timeline play/pause is separate React state while Canvas Video is always playing/looping/muted.

**Status: PARTIAL / P0 temporal truth gap.**

## Waveform — PARTIAL

Honest flat fallback is better than fake data. Zero-gap still needs actual sample extraction, caching and trim/speed alignment.

## ProjectStore — PARTIAL

Real classes exist and AssetRegistry really copies media.

Gaps:
- AsyncStorage draft service remains primary in several load/save/remix paths;
- ProjectStore is explicitly additive;
- unknown render-version migration can be stamped current when no migration exists;
- no runtime project-package schema validation before use;
- save deletes final before moving temp, creating an interruption window;
- CreatorContext overrides the safe default document path with a string that requires device validation;
- all acquisition paths must be proven to call AssetRegistry import.

## Upload manager — PARTIAL, not resumable transport

Good:
- persistent jobs;
- retry/backoff/jitter;
- bounded concurrency;
- pause/cancel API.

Not complete:
- whole file loaded as Blob;
- whole PUT;
- retry begins byte zero;
- no multipart/TUS parts/session state;
- progress emitted at completion rather than streamed transfer;
- current publish queues `bytesTotal: 0`, preventing size discovery;
- video gets `image/*` content type;
- background-transfer continuity unproven.

Correct current description: **persistent retry queue**, not true resumable uploader.

## Pinned tools — VERIFIED foundation

Personalization store/hook are integrated into ContextToolRail. Still needs polished pin/unpin UX and muscle-memory safeguards.

## Keyframes / speed curves / transitions — NEEDS END-TO-END PROOF

Editor state exists. Zero-gap requires the same values to drive:
- preview playback;
- canonical canvas;
- export;
- viewer;
- templates;
- migration.

Until then these are authoring controls without proven rendering completeness.
