# Accessibility, Responsive Layout and Motion Audit

## Current risk

Source presence of accessibility labels is not evidence that the flows are usable with VoiceOver/TalkBack, large text or switch navigation. The shared media stage and sticky actions are especially sensitive to gesture, focus and obstruction failures.

## Required width matrix

Capture and test at 320, 360, 390 and 430 logical pixels, plus a representative tablet layout if tablet is supported.

At each width verify:

- no horizontal clipping;
- media remains object-safe;
- numeric values do not collide with badges;
- sticky dock does not obscure final content;
- sheets fit above keyboard and safe areas;
- landscape/tall media does not cause uncontrolled first-viewport height;
- long titles, seller names, prices and localized dates reflow.

## Text and contrast

- Normal and largest supported accessibility text.
- Do not force `numberOfLines` on decision-critical content.
- Reflow transaction rows vertically when needed.
- Measure contrast for text over every image state; prefer an independent identity block.
- Test status colours in light/dark and without colour as the only signal.
- Use tabular numerals only where rapidly changing numbers benefit.

## Media accessibility

- Media item semantics include type, ordinal and description.
- Provide Previous/Next actions in addition to swipe.
- Announce item changes without excessive chatter.
- Provide captions/transcript metadata for video where required.
- Video playback controls must be labelled and reachable.
- Never autoplay audible media.
- Pause playback when backgrounded or focus leaves the viewer.

## State announcements

Politely announce real changes:

- bid accepted/rejected;
- leading/outbid;
- auction ended;
- market snapshot stale/reconnected;
- order partially/fully filled;
- listing became unavailable;
- retry succeeded.

Do not announce timer changes every second. Countdown accessibility text should update at meaningful thresholds.

## Touch, focus and sheets

- Interactive targets: at least 44×44 iOS points and 48×48 Android dp where possible.
- Deterministic focus on opening/closing fullscreen and sheets.
- Return focus to the invoking element.
- Hardware back dismisses the topmost layer only.
- Error messages are associated with the affected control.
- Sticky docks preserve logical reading order.

## Reduced motion

- Disable parallax, decorative scale and continuous shimmer.
- Bid-change feedback becomes a colour/weight transition without motion.
- Avoid looping decorative animations.
- Preserve essential carousel paging and video controls.

## Proof

Provide automated accessibility assertions plus manual VoiceOver and TalkBack notes. Record device, OS, text scale, appearance and reduced-motion setting for each capture.

