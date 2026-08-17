# Camera-First Information Architecture

## Target default state

```text
┌─────────────────────────────┐
│ ×                    ⚡  ⋯  │
│                             │
│        CAMERA PREVIEW       │
│                             │
│                             │
│ [gallery]       ◎    [flip] │
│                             │
│   LOOK    POSTER   SEARCH   │
└─────────────────────────────┘
```

No creator home dashboard. No Templates tile. No Items tile. No large Start with text row.

## Mode

Persist last-used mode, with contextual overrides: Create Look enters Look; Story enters Poster; visual-search CTA enters Search. Switching modes must not push a new route or replace the camera. It only changes framing, capture semantics and post-acquisition destination.

## Gallery

The gallery thumbnail is primary UI. Tapping it opens the media browser while retaining current mode. Confirming media immediately opens the editor.

## Look

Single capture or image → Look editor. Multi-gallery selection → Look editor with an immediately useful default composition. Items are added from inside the editor.

## Poster

Tap shutter for photo; hold/record for video. Single media → editor. Explicit multi mode accumulates captures, then Done → editor.

## Search

Search remains a camera mode. Capture/import flows into visual-search results, not into a generic creation dashboard.

## Secondary routes

Templates, drafts, text-only starts, AI effects and item browsing remain available through context/More/project surfaces. They are capabilities, not primary entry choices.
