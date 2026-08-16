# Source Register — August 2026 Creator Research

**Research cut-off:** 15 August 2026  
**Target codebase:** `K17ze/thryftverse-upgrade`  
**Target branch:** `feat/product-detail-contract-media-device-closure`  
**Audited HEAD:** `7273211383f6553bd6813a824140a99d50555111`

This register intentionally favors first-party product announcements, first-party support documentation, official framework documentation, platform HIG/WCAG material, and foundational HCI research. It does **not** use speculative reverse-engineering claims about private Instagram/Snapchat internals as design requirements.

## Meta / Instagram / Edits

1. Meta — **One Year of Edits: Built For and With Creators** (22 Apr 2026)  
   https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/  
   Evidence used: tool customization, pinned favorites, advanced color adjustments, speed curves, bilingual captions, project templates that can be inspected, creator workflow personalization.

2. Meta — **Introducing Edits: A Streamlined Video Creation App** (22 Apr 2025; updated 17 Dec 2025)  
   https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/  
   Evidence used: project management, longer capture, frame-accurate timeline, clip-level editing, green screen, transitions, keyframes, high-quality export, creator feedback workflow.

3. Meta — **Introducing Muse Image: Image Generation Built for Your World** (7 Jul 2026)  
   https://about.fb.com/news/2026/07/introducing-muse-image-meta-ai/  
   Evidence used: current optional AI effects direction and direct visual prompting/markup.

4. Meta LATAM — **Nuevos efectos en Stories de Meta AI** (7 Jul 2026)  
   https://about.fb.com/ltam/news/2026/07/nuevos-efectos-en-stories-de-meta-ai/  
   Evidence used: redesigned Stories effect selection with thumbnail previews so users can preview effects before choosing, reducing trial-and-error.

5. Meta — **Instants: Share in the Moment** (13 May 2026)  
   https://about.fb.com/news/2026/05/instants-share-in-the-moment/  
   Evidence used: camera-first experience can be powerful when the user's intent is explicitly immediate capture; it should not be applied blindly to every creation task.

6. Meta — **You Can Now Edit Videos With Meta AI** (11 Jun 2025)  
   https://about.fb.com/news/2025/06/edit-videos-with-meta-ai/  
   Evidence used: AI transformations are optional creative actions embedded in the editing workflow, not the navigation model itself.

7. Meta Newsroom — Instagram category / latest public product posts checked through 15 Aug 2026  
   https://about.fb.com/news/category/technologies/instagram/  
   Note: the latest relevant public creator/editor sources located for this audit were the July 2026 Stories/Muse updates and the April 2026 Edits roadmap; no later August creator-editor announcement was found in the official newsroom search used for this report.

## Snapchat

8. Snapchat Support — **How do I edit videos with Timeline Editor?**  
   https://help.snapchat.com/hc/en-gb/articles/41614255962132-How-do-I-edit-videos-with-Timeline-Editor  
   Evidence used: multi-clip timeline, scrub, trim, split, duplicate, replace, speed, volume, crop/rotate; text/stickers/music as timed layers.

9. Snapchat Support — **How do I capture or edit a Long Snap?**  
   https://help.snapchat.com/hc/en-us/articles/7012363739412-How-do-I-capture-or-edit-a-Long-Snap  
   Evidence used: continuous capture becomes multiple editable clips; press-and-hold reorder; import additional clips; timed overlay layers.

10. Snap Newsroom — **Quick Cut** (17 Dec 2025)  
    https://newsroom.snap.com/snap-quick-cut?lang=en-GB  
    Evidence used: select media → instantly preview a beat-synced rendered result → refine. This is a strong "successful default before configuration" pattern.

11. Snapchat Support — **Multi Snap**  
    https://help.snapchat.com/hc/en-gb/articles/7012374385940-How-do-I-use-Multi-Snap  
    Evidence used: rapid sequential capture and post-capture individual editing/removal.

12. Snap Newsroom — **Specs / creator tools announcements** (2026)  
    https://newsroom.snap.com/launch-specs-2026?lang=en-GB  
    Used only as a current ecosystem signal; not treated as a core mobile creator parity requirement.

## Expo / React Native / Reanimated / Skia

13. Expo SDK 57 — **ImagePicker**  
    https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/  
    Evidence used: multi-selection, ordered selection badges where supported, system picker behavior and permission constraints.

14. Expo SDK 57 — **MediaLibrary**  
    https://docs.expo.dev/versions/v57.0.0/sdk/media-library/  
    Evidence used: direct library-access capabilities and permission/policy implications.

15. Expo — **ImageManipulator**  
    https://docs.expo.dev/versions/latest/sdk/imagemanipulator/  
    Evidence used: deterministic crop/rotate/resize capability; not subject segmentation.

16. React Native — **0.86 release** (11 Jun 2026)  
    https://reactnative.dev/blog/2026/06/11/react-native-0.86  
    Evidence used: current platform baseline for this repository.

17. React Native — **Performance Overview**  
    https://reactnative.dev/docs/performance.html  
    Evidence used: minimum 60 FPS interaction expectation and JS/UI thread considerations.

18. React Native Skia — **Video**  
    https://shopify.github.io/react-native-skia/docs/video/  
    Evidence used: frame/time/duration access, seeking and GPU composition opportunities.

19. React Native Skia — **Canvas Overview**  
    https://shopify.github.io/react-native-skia/docs/canvas/overview/  
    Evidence used: canvas rendering/snapshot capability and high-bit-depth implementation considerations.

20. Software Mansion — **Reanimated Performance**  
    https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/  
    Evidence used: New Architecture performance caveats, non-layout animation preference, shared-value usage guidance.

## Accessibility / Motion

21. W3C — **WCAG 2.2**  
    https://www.w3.org/TR/WCAG22/

22. W3C — **Understanding Success Criterion 2.5.8: Target Size (Minimum)**  
    https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html  
    Evidence used: 24×24 CSS px AA minimum with exceptions. This report uses 44–48 pt as a stricter ThryftVerse mobile design target, not as a false statement of WCAG AA.

23. Apple — **Human Interface Guidelines: Accessibility**  
    https://developer.apple.com/design/human-interface-guidelines/accessibility/  
    Evidence used: adequately sized controls, alternatives to complex gestures, reduced-motion support.

24. Apple — **Human Interface Guidelines: Motion**  
    https://developer.apple.com/design/human-interface-guidelines/motion  
    Evidence used: purposeful, brief, precise, interruptible motion and Reduce Motion compatibility.

## Human-computer interaction / psychology

25. Ben Shneiderman — publication list, including **Direct Manipulation: A Step Beyond Programming Languages** (1983)  
    https://www.cs.umd.edu/~ben/publications.html  
    DOI: https://doi.org/10.1109/MC.1983.1654471  
    Principle used: visible objects + rapid, reversible, incremental actions reduce dependence on abstract command sequences.

26. International Journal of Human-Computer Studies (2026) — progressive disclosure / cognitive demand in exploratory GenAI interaction  
    DOI: https://doi.org/10.1016/j.ijhcs.2026.103771  
    Used as supporting evidence only; the domain differs from mobile creative editing.

## Repository evidence inspected on the target branch

- `frontend/package.json`
- `frontend/src/creator/index.ts`
- `frontend/src/creator/CreatorStudioShell.tsx`
- `frontend/src/creator/CreatorEntryScreen.tsx`
- `frontend/src/creator/CreatorCamera.tsx`
- `frontend/src/creator/camera/*`
- `frontend/src/creator/poster/PosterComposerScreen.tsx`
- `frontend/src/creator/look/LookComposerScreen.tsx`
- `frontend/src/creator/CreatorCanvas.tsx`
- `frontend/src/creator/CreatorAssetPicker.tsx`
- `frontend/src/creator/CreatorCropSheet.tsx`
- `frontend/src/creator/CreatorCutoutSheet.tsx`
- `frontend/src/creator/CreatorPublishSheet.tsx`
- `frontend/src/creator/CreatorContext.tsx`
- `frontend/src/creator/composition.ts`
- `frontend/src/creator/history.ts`
- `frontend/src/creator/drafts.ts`
- `frontend/src/creator/mediaUploadPipeline.ts`
- existing July/August creator audit files in repository root.

## Evidence hygiene

- Public competitor behavior is treated as a benchmark **mechanism**, not a license to copy visual identity.
- Private implementation details of Instagram/Snapchat that are not publicly documented are not used as requirements.
- A feature being present in code is **not** scored as flagship by itself.
- A code path is treated as flagship only when its entry, interaction, feedback, recovery, output fidelity and device performance are all credible.
