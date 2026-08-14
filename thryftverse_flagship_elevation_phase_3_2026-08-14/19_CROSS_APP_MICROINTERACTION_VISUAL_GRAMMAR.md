# Cross-App Microinteraction & Visual Grammar V3

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Flagship quality is interaction continuity

Prioritize:
- correct transition origin;
- stable geometry;
- no flash of wrong state;
- immediate press feedback;
- meaningful haptics;
- preserved scroll;
- keyboard continuity;
- no async layout jump.

## Motion classes

### Direct manipulation
Follow the finger on UI thread. No artificial delay.

### Navigation
Prefer native stack/sheet transitions.

### Selection
Small scale/opacity/spring. No flourish.

### State change
Crossfade/height only when continuity benefits.

### Success
Haptic + minimal confirmation. No confetti for routine operations.

## Haptic grammar

- selection — tabs/options;
- light — reversible utility;
- medium — deliberate commit before secondary confirmation;
- success — server-confirmed success;
- error — rejected/failed action.

Do not haptic every chip/scroll interaction.

## Radius grammar

- media: content-driven;
- controls: restrained 8–14pt family;
- sheets: native/system;
- pill: state/selection/tag only.

## Typography

Use fewer roles per viewport:
display/hero → title → body emphasis → body → meta.

Do not use many weights to compensate for weak hierarchy.

## Brand color

Use for:
- primary action;
- active selection;
- intentional link.

Do not use brand color for every icon, trust fact or status.

## Loading

Skeleton when geometry is predictable.
Spinner for short local action.
Semantic stages for long upload/agent work.
Render cached content instead of blanking the whole screen where possible.

## Empty states

Answer:
1. what is empty?
2. what can the user do?

An empty state does not automatically need icon background + card + title + subtitle + two CTAs.
