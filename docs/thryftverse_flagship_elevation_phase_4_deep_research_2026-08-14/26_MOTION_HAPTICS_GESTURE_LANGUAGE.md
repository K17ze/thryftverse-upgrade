# Motion, haptics and gesture language

## Principle

Motion is an explanation, not a reward.

## Canonical transitions

### Navigate
Native push/pop or system modal.

### Open detail from media
Shared visual transition only if stable and performant. Otherwise native push.

### Select
100–160ms opacity/scale or native pressed state.

### Reorder
Lift + slight elevation + haptic at position change.

### Sheet
System/native bottom sheet motion where possible.

### Content scope change
No forced fade unless the content relationship would otherwise be confusing.

## Remove/reduce
- repeated `FadeInDown` on static sections;
- delayed section stagger on settings/analytics;
- springs on purely informational badges;
- celebratory animation for ordinary save/share;
- haptic on refresh/poll/data arrival.

## Haptics
Use:
- selection: segment/picker value;
- light: ordinary discrete action;
- medium: destructive/commit where useful;
- success/error: completed transaction/publish only.

Do not haptic:
- every scroll threshold;
- every second/countdown;
- background sync;
- automatic agent/tool event.

## Gesture conflict matrix

Test conflicts:
- product vertical dismiss vs vertical scroll;
- product horizontal media vs back gesture;
- creator object drag vs frame swipe;
- chat swipe row vs system back;
- collection drag vs scroll;
- pinch zoom vs parent pan;
- bottom sheet drag vs nested scroll.

## Reduced motion
When enabled:
- no simulated spring bounce;
- no auto-parallax;
- shared transition becomes fade/native navigation;
- progress remains functional;
- gestures remain operable without motion dependence.

## Acceptance
A motion reviewer must be able to state what each animation communicates. If the answer is only “premium feel,” remove it.
