# AI Photo Enhancement — Design Documentation

## Concept

AI photo enhancement is a 2026 table-stakes feature for resale marketplaces. Depop's Photoroom integration (AI background removal, AI shadows, image resizing) drove a 1.5% uplift in listings. eBay AI Snap and Tilt Snap AI provide similar capabilities. ThryftVerse's AI photo enhancement surface brings this capability to the Co-Own and resale workflow.

## Why It Matters

- **Seller enablement:** Reduces the friction of creating high-quality listings
- **Visual consistency:** Raises the baseline image quality across the marketplace
- **2026 parity:** Depop, eBay, and Tilt all have AI photo tooling
- **Conversion:** Better images → more buyer confidence → higher conversion rates

## Service Architecture

File: `src/services/aiPhotoEnhancementApi.ts`

The service is **mock-ready** — all functions return mock data with `isDemo: true` per AGENTS.md §11. The mock does NOT fabricate enhanced images; it returns the original image URI with a clear demo flag.

### Types
- `EnhancementOption` — individual enhancement (background removal, AI shadows, auto crop, color correction, lighting fix, background replace)
- `EnhancementPreset` — curated combination of options (Studio Clean, Lifestyle Warm, Editorial Dark, Natural Light)
- `BackgroundScene` — replacement background (studio, lifestyle, neutral, colored)
- `EnhancementResult` — result with originalUri, enhancedUri, option, isDemo flag

### Functions
- `fetchEnhancementOptions()` — available enhancement options
- `fetchBackgroundScenes()` — available background replacement scenes
- `fetchEnhancementPresets()` — curated presets
- `applyEnhancement(imageUri, optionId)` — apply a single enhancement (mock)
- `applyPreset(imageUri, presetId)` — apply a preset (mock)
- `replaceBackground(imageUri, sceneId)` — replace background (mock)
- `revertEnhancement(resultId)` — revert to original (mock)

### Real API Integration Path
Replace the mock implementations with calls to a real AI image processing backend (e.g. Photoroom API, replicate.com, or a custom microservice). The `isDemo` flag should be removed when the real API is connected.

## Screen Design

File: `src/screens/AIPhotoEnhancementScreen.tsx`

### Layout
- **Image preview** (top 50%): 4:5 aspect ratio marketplace standard, before/after toggle
- **Enhancement options rail**: horizontal scroll of icon + label chips
- **Presets section**: curated preset chips
- **Background scene picker**: shown when "Background Replace" is selected
- **Sticky footer**: Revert + Apply buttons

### Truthful Demo Mode
Per AGENTS.md §11, the demo mode is explicitly labelled:
- "Demo Mode" banner: "AI enhancement is not yet connected. This preview shows the planned capability."
- Apply button shows "Preview (Demo)" — does NOT claim success
- After "applying": "Demo: No changes were made to your image. Connect the AI service to enable real enhancement."
- The displayed image is always the original — no fabricated enhanced images

### State Coverage
- Loading: skeleton while fetching options
- Populated: image + options ready
- Empty: "Select an image to enhance"
- Error: error banner with retry
- Offline: offline banner
- Processing: overlay during "enhancement"
- Applied: truthful demo message

### Integration
The screen is accessible from `AIPoweredListingScreen` via an "Enhance Photos" affordance. It receives an `imageUri` param (and optional `itemId`).

## Future Expansion

- **Real Photoroom/API integration** — replace mock with production AI service
- **Batch enhancement** — enhance multiple photos at once
- **Video enhancement** — AI frame extraction and enhancement for video listings
- **AI-generated backgrounds** — generative AI for custom scene creation
- **Enhancement history** — undo/redo stack within a session
- **Seller analytics** — track conversion uplift from enhanced vs. non-enhanced listings
