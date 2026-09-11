# Task 4 Brief â€” Human-touch micro-polish: real upload progress on profile media, coaching-copy removal

## Context

Repo root: `C:\Users\User\Desktop\thryftverse-upgrade` (React Native / Expo / TypeScript). This is the final polish wave of an editor/upload flagship campaign. The transport layer reports REAL byte progress (`useProfileMediaUpload` computes `progress` 0â€“1 from XHR bytes) but profile surfaces collapse it to a binary spinner â€” which reads as fake. Coaching copy ("Keep the app open", "Review the edgesâ€¦") is a rejected pattern.

## Requirements

### 1. FlagshipProfileMedia.tsx (`frontend/src/components/flagship/FlagshipProfileMedia.tsx`)
- Find where `isUploadingCover` (or equivalent) renders `<ActivityIndicator>`. Replace with a REAL determinate ring driven by the byte progress the host already receives (check the component's props â€” if it only receives a boolean, extend the prop to accept `uploadProgress?: number` and update ALL call sites to pass the real value; find call sites via grep for the component name).
- Ring: same grammar as the listing ring â€” 28pt, 2.5pt stroke, white arc on `rgba(0,0,0,0.35)` circle, `react-native-svg` (verified installed) + Reanimated.
- On complete: fade out, no badge.

### 2. EditProfilePreview.tsx (`frontend/src/components/profile/EditProfilePreview.tsx`)
- Same replacement: binary ActivityIndicator â†’ real progress ring (or the same minimal determinate treatment) wherever `isUploading`-style booleans hide a real progress value. If the hook's progress value isn't threaded into this component, thread it minimally through props â€” do not rewire the upload stack.

### 3. Coaching-copy removal in `frontend/src/screens/AIPhotoEnhancementScreen.tsx` (COPY ONLY â€” do not restructure this screen)
- Remove the "Keep the app open" line (lines ~515â€“523 area).
- Remove "Review the edges around the product to ensure nothing was cut off." (line ~722 area).
- Remove "Drag the slider to compare Â· {label}" instructional prefix â€” keep the operation label only if it's meaningful provenance, else remove the line entirely.
- Keep the honest provenance/disclosure line (provider + disclosure type) â€” that is trust information, not coaching. If provenance renders as two stacked labels, collapse to ONE line.
- Do NOT touch the tool/preset/scene chip logic, the phases, or the API calls in this task.

### 4. Haptic + readout audit in `frontend/src/creator/controls` (CreatorSlider)
- Verify the straighten slider haptic fires on 0-crossing and at range ends (existing `hapticAtNeutral`). If the slider lacks a live value readout API, add an optional `valueLabel?: (v: number) => string` prop that renders a small tabular-numeral caption (e.g. "3.5Â°") beside the slider â€” used by the crop sheet's straighten control. Keep it opt-in; no consumer changes beyond the crop sheet IF the crop sheet currently passes none (check â€” another agent may be rewriting CreatorCropSheet.tsx concurrently: DO NOT edit CreatorCropSheet.tsx yourself; only add the slider prop and note it in your report so the controller can wire it).

### 5. Constraints
- Do NOT touch: CreatorCropSheet.tsx, ListingMediaStudio.tsx, ListingPublishFooter.tsx, EditListingFooter.tsx, BottomSheet*.tsx, ShippingPickerSheet.tsx, ThemeContext.tsx.
- You MAY touch: FlagshipProfileMedia.tsx, EditProfilePreview.tsx, AIPhotoEnhancementScreen.tsx (copy only), CreatorSlider (frontend/src/creator/controls*), en.json (FORBIDDEN — another agent owns it; report needed key changes instead), ProfileMediaEditor.tsx ONLY if it hosts the same binary-spinner pattern (check first).
- No new dependencies. No `any`. Match existing style.

## Verification (from repo root)

```
cd frontend; node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
cd frontend; node ./node_modules/eslint/bin/eslint.js src/components/flagship/FlagshipProfileMedia.tsx src/components/profile/EditProfilePreview.tsx src/screens/AIPhotoEnhancementScreen.tsx
node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en.json','utf8')); console.log('json ok')"
cd frontend; node ./node_modules/vitest/vitest.mjs run --silent 2>&1 | tail -6
```
Baseline failures to ignore: groupChatInfoParity.test.tsx, pricingDisplayModes.test.ts, coownP0ForegroundRevalidation.test.ts. Zero NEW failures.

## Report

Full report â†’ `.flagship/sdd/task-4-report.md`. Return: status, files changed, one-line test summary, concerns.

