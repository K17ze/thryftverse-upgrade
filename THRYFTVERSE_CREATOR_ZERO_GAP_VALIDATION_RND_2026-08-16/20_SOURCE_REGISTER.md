# Source Register — 16 August 2026

## Meta / Instagram / Edits — first party

### One Year of Edits: Built For and With Creators — 22 Apr 2026
https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/

Used for:
- simple/approachable powerful editor direction;
- advanced color adjustments roadmap;
- speed curves;
- customizable/pinned tools;
- personalized project setup;
- inspectable template projects;
- overlays/keyframes/effects direction.

### Introducing Muse Image — 7 Jul 2026
https://about.fb.com/news/2026/07/introducing-muse-image-meta-ai/

Used for:
- 30+ AI-powered Instagram Story effects;
- preset-assisted creative effects;
- direct visual markup/edit;
- current Meta generative creative direction.

### Meta Product News archive
https://about.fb.com/news/category/product-news/

Used for recency cross-check. The research performed for this audit did not locate a later official August 2026 Instagram/Edits creator-editor announcement than the relevant July/April material above.

## Snapchat — first party

### Timeline Editor
https://help.snapchat.com/hc/en-us/articles/41614255962132-How-do-I-edit-videos-with-Timeline-Editor

Used for multi-clip timeline, scrub, trim, split, duplicate, replace, speed, volume, crop/rotate and timed layers.

### Long Snap
https://help.snapchat.com/hc/en-us/articles/7012363739412-How-do-I-capture-or-edit-a-Long-Snap

Used for continuous multi-clip capture, trim, reorder/import and timed overlays.

### Drawing
https://help.snapchat.com/hc/en-gb/articles/7012355066260-How-do-I-draw-on-a-Snap

Used for pinch brush sizing, color slider, palette switching and emoji brush.

### Text
https://help.snapchat.com/hc/en-gb/articles/7012322034196-How-do-I-add-text-to-a-Snap

Used for styles/sizes, formatting, color, mentions, timing and captions.

### Stickers
https://help.snapchat.com/hc/en-gb/articles/7012364407060-How-do-I-add-stickers-to-my-Snaps

Used for manipulation, object pinning/tracking, categories, location/poll and Auto Stickers.

### Green Screen
https://help.snapchat.com/hc/en-gb/articles/8132928299924-How-do-I-use-Green-Screen-on-Snapchat

### Director Mode
https://help.snapchat.com/hc/en-gb/articles/8132871831828-What-is-Director-Mode

## TikTok — first party

### Editing, posting and deleting
https://support.tiktok.com/en/using-tiktok/creating-videos/editing-posting-and-deleting

Used for current text/sticker/GIF/cover and creative-edit surface comparison.

Additional localized TikTok Support pages were consulted for advanced editor behavior such as multi-track trim/split/speed/transitions/overlays and Magic editing.

## Expo / React Native — primary docs

### Expo Image
https://docs.expo.dev/versions/latest/sdk/image/

### Expo ImagePicker SDK 57
https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/

### Expo FileSystem
https://docs.expo.dev/versions/latest/sdk/filesystem/

### React Native View Style Props
https://reactnative.dev/docs/view-style-props

Used to validate that a production native filter pipeline must be based on supported native rendering semantics rather than assuming arbitrary web CSS filter behavior.

## Repository evidence

Branch: `feat/product-detail-contract-media-device-closure`  
HEAD: `b22b94184f5222255a9d9449f04b2dd0fb79dc6d`  
Primary reconstruction: `ba7bcba5ca5eca7ef049c6b6118994cd28f0bd3b`

Key files inspected:
- `frontend/package.json`
- `frontend/src/creator/CreatorContext.tsx`
- `frontend/src/creator/CreatorAssetPicker.tsx`
- `frontend/src/creator/CreatorAnimations.tsx`
- `frontend/src/creator/CreatorCanvas.tsx`
- `frontend/src/creator/CreatorPublishSheet.tsx`
- `frontend/src/creator/compositionContract.ts`
- `frontend/src/screens/PosterViewerScreen.tsx`
- `frontend/src/creator/surfaces/ContextToolRail.tsx`
- `frontend/src/creator/surfaces/CutoutPreviewSheet.tsx`
- `frontend/src/creator/core/toolRegistry.ts`
- `frontend/src/creator/core/personalization/*`
- `frontend/src/creator/core/projectStore/*`
- `frontend/src/creator/core/upload/*`
- `frontend/src/creator/core/cutout/CutoutService.ts`
- `frontend/src/creator/tools/text/*`
- `frontend/src/creator/tools/drawing/DrawingWorkspace.tsx`
- `frontend/src/creator/tools/effects/*`
- `frontend/src/creator/look/BackgroundSheet.tsx`
- `frontend/src/creator/poster/PosterComposerScreen.tsx`
- `frontend/src/creator/poster/timeline/*`

## Evidence rule

A competitor capability is marked verified only where first-party public documentation supports it. A ThryftVerse capability is marked verified only where current branch code materially implements it. Rendered/device quality remains unverified until captured on real hardware.
