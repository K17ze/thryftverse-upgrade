# Production Media Processing Worker

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## What the repo currently proves

The backend has:
- media asset lifecycle;
- processing job claim endpoint;
- processing-result endpoint;
- derivative schema;
- canonical URL checks;
- dimensions;
- blurhash/focal fields.

Repository search does **not** evidence a concrete production transcoder/derivative worker implementation beyond routes/tests.

Therefore the safest conclusion is:

> The processing **contract is ready**, but a production processor worker is not evidenced in the audited repository.

## Phase 6 worker responsibilities

### Image
- inspect/decode;
- normalize orientation;
- malware/integrity path;
- safe metadata policy;
- generate variants;
- preserve source;
- blurhash/thumbhash;
- focal suggestions where appropriate;
- AVIF/WebP/JPEG fallback strategy;
- alpha-preserving PNG/WebP for cutouts.

### Video
- validate container/codecs;
- generate poster;
- normalized delivery;
- 720/1080 variants;
- optional HLS;
- preview clip;
- audio loudness;
- rotation;
- duration;
- moderation frames.

## Candidate implementation

Benchmark before choosing:
- Sharp/libvips for images;
- FFmpeg/managed media service for video;
- cloud-native transcoder if scaling/operations favour it.

Do not choose a managed service merely for “flagship” naming.

## Worker loop

1. Claim job.
2. Download/read source from private processing boundary.
3. Verify.
4. Process.
5. Upload derivatives into configured CDN boundary.
6. POST processing result.
7. Retry with bounded exponential policy.
8. Metrics/dead-letter.

## Security

- never trust file extension;
- sniff MIME;
- decode with resource limits;
- size/pixel count caps;
- zip/document bomb prevention;
- quarantine;
- internal service token;
- no arbitrary output URL.

## Observability

p50/p95:
- image processing;
- video processing;
- queue wait;
- derivative sizes;
- failures;
- moderation review rate.
