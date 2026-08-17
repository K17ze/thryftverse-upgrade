# Source Register — 17 August 2026

## Repository evidence
Branch: `feat/product-detail-contract-media-device-closure`  
HEAD: `c90f8c647516a42d4ec6cb5255c568b3102a84e2`

Inspected:
- `frontend/src/creator/CreatorEntryScreen.tsx`
- `frontend/src/creator/CreatorCamera.tsx`
- `frontend/src/creator/CreatorStudioShell.tsx`
- `frontend/src/creator/look/LookComposerScreen.tsx`

Current HEAD explicitly adds Look auto-layout, AI effect browser, camera effects and multi-clip capture. `CreatorEntryScreen.tsx` explicitly states that the previous camera/gallery entry was replaced by Camera / Photos / Items / Templates intent tiles plus Start with text. Look currently has multiple possible simultaneous lower surfaces including Auto Layout, Layout Preview, Source Tray and Context Tool Rail.

## Public competitor sources checked

### Snapchat — Create a Snap
https://help.snapchat.com/hc/en-us/articles/7012326414612-How-do-I-create-a-Snap

Current public flow centers Camera: tap for photo, hold for video, then use creative tools.

### Snapchat — Timeline Editor
https://help.snapchat.com/hc/en-us/articles/41614255962132-How-do-I-edit-videos-with-Timeline-Editor

Current documented flow starts with video capture from Camera/Director Mode and moves into editing/timeline from the captured content.

### Snapchat — Memories to Story
https://help.snapchat.com/hc/en-gb/articles/7012411359636-How-do-I-create-a-Story-from-Memories

Gallery/media creation remains adjacent to the camera via Memories.

### Meta — Introducing Edits
https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/

Meta describes Edits around simpler ways to work, end-to-end creation, longer capture and precise editing.

### Meta — One Year of Edits
https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/

Current 2026 direction emphasizes powerful tools that remain simple and approachable.

### Meta — Edits archive
https://about.fb.com/news/tag/edits/

Checked for recency. As of 17 Aug 2026, the latest dedicated Edits newsroom article found in the official archive is 22 Apr 2026.

## Interpretation

The goal is not pixel cloning. The design principle extracted from mature creator products is: **capture/media first; editing follows content; complexity is progressively disclosed; advanced features do not require a dashboard before creation.**
