# Accessibility, adaptivity and platform fidelity

## iOS
- use semantic/native navigation/search/material where practical;
- Liquid Glass only in navigation/control layer;
- respect Reduce Motion / Reduce Transparency / Increase Contrast;
- native swipe-back must not be blocked by custom gestures;
- safe areas + keyboard.

## Android
Current 2026 Android guidance expects:
- edge-to-edge;
- 3–5 primary destinations;
- actions separated from navigation;
- adaptive navigation rail on larger windows;
- layouts reflow across size classes;
- avoid simply stretching phone UI.

## Required breakpoints
- <350 dp compact;
- 350–599 compact;
- medium;
- expanded.

## Large screen transformations
- Home/Explore: more columns, not giant tiles.
- Search: results + selected preview optional.
- Inbox: conversation list + chat two-pane.
- Settings: group list + detail.
- Seller: navigation rail/supporting pane.
- Co-Own: market list + detail.
- Creator: canvas + tool pane where space allows.

## Dynamic type
Test at:
- default;
- large accessibility sizes.

Avoid:
- fixed-height rows that clip;
- all-caps long labels;
- hard `numberOfLines=1` on essential status.

## Contrast
Media overlay controls need adaptive scrim/background.
Status colors must always have text/icon/state shape, not color only.

## Accessibility labels
Don't duplicate:
`button, Search, Search auctions`.

Prefer meaningful:
`Search auctions`.

## Gesture alternatives
Every gesture-only action needs reachable equivalent:
- swipe delete → context menu;
- drag reorder → accessibility move actions;
- double-tap flip → flip button;
- pinch zoom → zoom control.

## QA
Accessibility is a screenshot + screen-reader + keyboard test, not only props.
