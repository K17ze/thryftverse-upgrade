# Thryft Media Export (Phase 2 Native Module Specification)

## Overview
This directory contains the Nitro HybridObject interface specification (`ThryftMediaExport.nitro.ts`) for future on-device hardware-accelerated video/image composition and export using AVFoundation (iOS) and Media3 Transformer (Android).

## Current Production Path
For current production releases, Creator publishing is handled by `frontend/src/creator/mediaUploadPipeline.ts` and `frontend/src/services/mediaUpload.ts`:
1. Media captured on device is uploaded directly to S3/MinIO via presigned URLs.
2. The backend media pipeline (`backend/api/src/lib/media/`) handles transcoding, HLS packaging, and thumbnail generation using FFmpeg under Linux.
3. Creator documents with remote layer references are stored and served via `/creator/publications`.

## Native Module Status
- **TypeScript Spec**: `src/ThryftMediaExport.nitro.ts` (complete contract for Nitrogen codegen).
- **JS Fallback**: `src/index.ts` gracefully returns `isMediaExportAvailable() === false` when the native binary is not linked (Expo Go / standard builds).
- **Native Implementation**: Planned for Phase 2 custom dev client builds with native AVFoundation/Media3 bindings.
