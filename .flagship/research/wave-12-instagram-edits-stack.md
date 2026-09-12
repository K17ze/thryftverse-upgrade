# Wave 12 — Instagram/Meta Capture→Edit→Upload→Publish Stack Audit
**Date:** 2026-09-11 · **Purpose:** Benchmark a competitor React Native editor/upload implementation against Instagram's current stack · **Scope:** Edits app, in-app Reels editor, Stories composer, upload pipeline, preview/export parity, state coverage

**Evidence classes used:** `P` = primary (Meta/Instagram official: about.fb.com, creators.instagram.com, engineering.fb.com, ai.meta.com, developers.facebook.com, app store listings, help center) · `E` = employee/first-party-adjacent (LinkedIn post by IG Edits Graphics Rendering lead, ex-IG infra engineer write-up, SOSP paper) · `S` = reputable secondary (TechCrunch, WIRED, Social Media Today, Gadgets360) · `D` = developer-community/anecdotal (Meta dev forums, SO) · `SEO` = low-quality content sites (never sole source for a material claim).

---

## 1. EDITS — Meta's standalone editor (launched 2025-04-22; ~17 months old at audit)

### 1.1 Core feature set (as of mid-2026)
- **Capture:** in-app camera up to 10 min clips; camera controls for resolution, frame rate, dynamic range, upgraded flash/zoom. [P — App Store listing, apps.apple.com/us/app/edits-video-editor/id6738967378]
- **Timeline:** frame-accurate, single-frame precision, clip-level editing; multi-track ("multi-channel editing" at launch → main track + overlay/visual clips + audio tracks). [P — about.fb.com 2025-04 launch post; S — SMT 2025-06-10]
- **Trim/split/reorder + track linking:** Jan 2026 added "Visual Clips + Sound Effects" toggle — choose whether main-track edits propagate to linked visual/audio clips (linked vs. unlinked track behavior). Copy/paste of fonts AND clips across projects. Guides, frames, snapping moved to a dropdown under the project name. [S — Social Media Today 2026-01-27; thesocialmediastar]
- **Keyframes:** shipped Aug 2025 — position/rotation/scale keyframes, then keyframe *curves* (easing) later same month; keyframing for text/stickers/overlays/cutouts followed. [S — linxtechnews 2025-08-15; viralvaultindia]
- **Cutouts:** on-device SAM 2.1 (Segment Anything) object segmentation: auto-suggest objects → interactive positive/negative clicks → one-tap "track" to propagate mask across frames incl. occlusions. FAIR optimized throughput 1.8× via Torch Inductor (no quantization needed). Used hundreds of thousands of times in first 24h. [P — ai.meta.com/blog/instagram-edits-cutouts-segment-anything]
- **Green screen / overlays / video overlay layers;** Sept 2025: convert clips into overlays; control fade-in/out speed for transitions. [S — SMT 2025-09-16]
- **Captions:** auto-generated, customizable appearance; custom caption animations (Nov 2025); bilingual auto-translated captions across 15 languages (Jul 2, 2026). [S — SMT 2025-11-04; Kompozy review]
- **Audio:** trending-audio Inspiration feed, beat markers (auto-detected, May 2025), volume-level editing, per-element audio balance matching, external audio file import + rename/save, 200+ sound-effect drops, royalty-free music, voice enhancement/noise reduction, voice effects. [S — SMT 2025-05-13; thelinkx 2026-06-07]
- **Teleprompter:** shipped ~Jun 2025 — script scrolls beneath front camera. [S — SMT 2025-06-10]
- **Restyle/Modify:** Meta AI prompt-based video/photo restyling. [S — SMT]
- **Project model:** "keep track of all your drafts and videos in one place" — persistent Projects tab (not ephemeral); storyboards for scripts/teleprompter cues/notes (added later 2025). [P — about.fb.com; creators.instagram.com]
- **Insights:** live insights dashboard — retention curves ("where users stop watching"), followers gained per reel, skip-rate feedback, top-10 recent reels by views; Jun 2026 added audience demographics + peak-engagement times. [P — creators.instagram.com; S — TechCrunch 2026-06-11]
- **Export:** 4K, **no watermark** (vs CapCut's paid de-watermarking — key differentiator), export quality selector mirrors source, "progress overview for exports" (Aug 2025), expanded export options; App Store notes cite "fewer crashes and smoother exports" (v445). [P — App Store; S — WIRED 2025-05; SMT 2025-08-15]
- **Publish path:** share directly to Instagram/Facebook from inside Edits "with high-quality playback" (internal upload path preserves quality vs camera-roll re-upload); or export to camera roll for any platform. [P — App Store listing]

### 1.2 Release cadence & 2026 state
- **130+ features shipped in year 1** via *weekly* drops; team held Friday-morning readiness reviews ("Is this ready yet? Is it good enough?") with a creator feedback loop pre- and post-launch. Head of app: Brett Westervelt; product lead quoted at launch: Josh Bender ("we launched a minimum viable product… launch great features every month or every week"). [S — Gadgets360 anniversary piece Apr 2026; WIRED May 2025]
- **Jan 2026:** cross-project copy/paste, track linking control, object-specific effects, Reverse, more text animations. [S — SMT 2026-01-27]
- **Jun 2026:** external audio import, audio level matching, 200+ SFX, font search. [S — thelinkx 2026-06-07]
- **Jun 11, 2026 (creator event, L.A.):** previewed **AI assistant** (analyzes creator's IG views/retention → suggests ideas + trending audio) and a **desktop version** with seamless mobile↔desktop project sync; launched same-day: **Beta tab** for experimental features, expanded audience insights, Inspiration feed topic search, **multi-version/A-B testing** (create multiple versions of one video to test before publishing). [S — TechCrunch, TNW 2026-06-11]
- **Jul 2, 2026:** bilingual captions (15 langs), overlay templates, clip locking. [S — Kompozy]
- **Traction claims:** content made in Edits = ~10% higher save rate, +2% reshare rate; >50% of Reels viewers see Edits-made content daily; per Meta Q4 earnings commentary, ~10% of all Reels viewed daily are made in Edits (3× prior quarter). [S — TechCrunch; E — LinkedIn, Hangyu Kuang, Edits graphics-rendering TL]
- **Architecture signals:** Edits' core tech is a shared **audio/video rendering engine + effects platform** built by a dedicated Graphics Rendering team — "powering not just Edits, IG but several Meta apps too" → one engine feeds standalone editor, in-app editor, and presumably export. Android package `com.instagram.basel` (codename Basel). [E — LinkedIn post; P — Play Store listing]

### 1.3 Known failure-state complaints (benchmark warnings)
- Play Store reviews flag caption-generator reliability and **lost draft/work** (saved-as-draft caption edits disappearing) — even Meta ships autosave bugs; draft persistence integrity is a real differentiator if done right. [D — Play Store reviews]

---

## 2. REELS EDITOR (in-app)

- **Structure:** two-stage flow — camera (record multi-clip up to ~20 min total, progress bar at top) → preview/decorate screen → "Edit video" opens a **single unified timeline showing clips + text + stickers + music as layers** (layered editor rolled out globally Apr 2023, modeled on CapCut's multilayer view). [P — FB Help Center; S — Planoly]
- **Timeline ops:** tap clip thumbnail → trim via drag handles; playhead + Split; Reorder mode (drag-and-drop, delete); add clips mid-edit; transitions at clip junctions (tap white handle, preview, "Apply to all"); tap/hold text or sticker on timeline to retime/move; tap music track to replace. Undo/redo up to **20 actions** via arrows above timeline. [P — Help Center 261360253626830; S — GuidingTech]
- **Camera-side tools:** Align (translucent onion-skin of previous clip for jump-cut alignment), Gesture Control (raise hand to start/stop), Dual (front+rear simultaneous), speed, timer/hands-free, AR effects. [S — Planoly; P — Help Center]
- **Newest additions (2026):** **"First Draft"** (Aug 25, 2026) — auto-trims selected clips, removes pauses, assembles a rough cut in ~10s, editable after; accessible from camera and multi-select gallery. iOS first. Also **Replace Audio** on already-published feed posts/carousels (swap music without re-upload). [S — TechCrunch 2026-08-25]
- **Drafts:** reel drafts persist indefinitely (vs story drafts' 7-day expiry); drafts stored locally on device, lost on reinstall. [S — Vaizle insights; allofinsta]
- **Save-without-watermark:** edited reel can be downloaded watermark-free before publishing (top of edit screen). [S — Planoly]

---

## 3. STORIES COMPOSER

- **Entry:** swipe-right from feed or + → Story; camera-first surface.
- **Capture modes (left rail):** Normal (tap photo / hold video w/ progress ring, 60s), Boomerang (burst→loop, effects: SlowMo/Echo/Duo), Layout (2–6 photo grids, mix live + gallery), Multi-Capture, Hands-Free (tap-to-record + countdown timer), Dual (front+back PiP), Create mode (no media needed: text/GIF/questions templates). Swipe for live AR effects; Browse effects for creator-made effects. Mid-recording camera flip supported. [P — help.instagram.com/314684928883274; S — androidpolice, trypostbase]
- **Decorate layer (top-right icon rail):** text (fonts, animations, double-tap font for styles), Draw, sticker tray (Add Yours, Add Yours Music, Cutouts — camera-roll object→reusable sticker, Frames, Reveal, Link, Music w/ timed lyrics + multiple display styles via tap-to-cycle), effects. **Direct manipulation:** drag position, pinch scale, rotate; drag-to-trash delete. [P — about.fb.com 2024-05 stickers post; S — trypostbase]
- **Restyle (Oct 23, 2025):** Meta AI edits inside composer — video gets preset styles; photos get free-text prompts (add/remove/change elements) + presets; a resulting sticker lets friends apply identical edits (viral edit-propagation). [S — 9to5Mac]
- **Audience/post targets:** Your Story / Close Friends / share targets incl. DM; post is fire-and-forget (composer dismisses immediately).
- **Drafts:** exit → "Save Draft" prompt → Drafts section in Stories composer/gallery. **7-day expiry, local-only storage** (lost on reinstall) — deliberately scoped persistence, not synced. [S — Vaizle, allofinsta]

---

## 4. UPLOAD / POSTING PIPELINE — deepest evidence section

### 4.1 Client-side upload architecture (the transferable core)
Instagram's Video Infra team (2017, still the conceptual basis):
- **Problem:** per-surface copy-pasted upload paths (feed/direct/stories) → unified into **one layered, componentized upload infra** with clean product↔infra interfaces; all products inherit infra improvements. [E — Ning Zhang, "Video@Scale: Upload Unification", medium.com/@ningzh]
- **Segmented upload:** file split into segments; **each segment encoded and uploaded independently → overlap encode+upload, parallel segment uploads**; **smart resume/retry at segment level** (not file level). Results: latency cut >2×, failure rate down ~5×. [E — same]
- Most upload time/failures happen **client-side during encode+upload** (flaky networks, app kills) → design centered on surviving process death and resuming. [E — same]
- **Per-video smartness:** "no typical video or user" — heuristics → ML models tune the upload path per video/device/network. [E — same]
- Adopted FBUpload protocol (Meta-wide upload service) replacing custom nginx chunked-transfer endpoint for reliability + shared improvements. [E — same]

### 4.2 Resumable protocol (public surface — mirrors internal design)
Graph API resumable uploads expose Meta's internal model:
- 3-step **container model**: `POST /media?upload_type=resumable` → container ID + `rupload.facebook.com` URI → `POST` bytes with **`offset` + `file_size` headers** (resume from byte offset after interruption) → `POST /media_publish?creation_id=…`. [P — developers.facebook.com resumable-uploads doc]
- **Explicit multi-phase status machine:** `video_status.uploading_phase` (status + `bytes_transferred`), `processing_phase` (not_started/in_progress/complete), `publishing_phase`, `copyright_check_status`. Container `status_code`: `IN_PROGRESS → FINISHED → (publish) → PUBLISHED`; failure codes `ERROR`, `EXPIRED` (containers expire 24h). [P — same doc + IG User Media reference]
- Poll `status_code` before publishing; publish while `IN_PROGRESS` fails; transient publish errors → retry w/ backoff (1–2 tries in 30s–2min), then new container. Real-world: processing can take minutes (occasionally hours during incidents — "stuck IN_PROGRESS" forum threads); retry-storms cause **duplicate posts** — idempotency/timeout discipline required. [P — error-codes doc; D — Meta dev forum threads]

### 4.3 Server-side processing (SVE — Streaming Video Engine, SOSP'17)
- Processing = **DAG of operations** (validate → transcode → watermark → thumbnails → encryption → per-format variants) executed by preprocessor/scheduler/workers; per-node retries isolate failures — no end-to-end restart. [E — SVE paper, oar.princeton.edu]
- **GOP-segmented upload:** client splits video on Group-of-Pictures boundaries → each GOP is a standalone mini-video → server begins processing **while upload still in progress** (overlap), parallel per-segment processing, then stitch. Target: p90 upload+process < 10s for shareability. **<10MB videos bypass segmentation** (overkill → separate simple pipeline). [E — SVE paper; engineered.at summary]
- **Critical vs non-critical scheduler queues** — latency-sensitive work never blocked by bulk encoding. [E — SVE paper]
- **Two encoding classes:** minimum-functionality (all-client compatible ABR) + advanced (newer codecs, higher quality). 2022 innovation: derive basic encodings from advanced ones → 94% compute cut on basics, freeing capacity for advanced encodings (~15%→growing watch-time share). [P — engineering.fb.com 2022-11-04]
- **HDR end-to-end (2023):** full 10-bit HDR preservation from camera-roll upload → server → playback on Reels; **SDR UI overlays rendered at HDR-comparable brightness** so they stay legible on HDR video — direct evidence Meta treats preview/composited-UI parity as an engineering problem. [P — engineering.fb.com 2023-07-17]

### 4.4 In-app posting UX (observed behavior)
- Share → composer dismisses → **upload continues in background**; progress bar/banner over feed; post appears optimistically on own profile grid in "posting" state; final "finishing up" stall = server transcode/verify phase (progress bar sits at ~99% while server works); failure → persistent "failed to post, tap to retry" affordance + push notification; post surfaces to followers only after server processing completes. [S/D — aurascience analysis + consistent user reports; D — Thryft Ship support doc describing per-item retry]
- The ads pipeline post documents Meta's own pattern: **async processing + retry queue with rate-limiting** — callers never re-trigger processing on each poll (prevents thundering-herd on the transcode service). [P — about.instagram.com engineering blog]

---

## 5. PREVIEW = EXPORT PARITY

- **Shared engine:** Edits' rendering/effects engine is platformized across Meta apps (LinkedIn: "powering not just Edits, IG but several Meta apps") → same code path renders interactive preview and final output. [E — LinkedIn]
- **Real-time parity requirement proven:** SAM 2.1 Cutouts must run "fast enough to give the user a real-time experience" — selection→mask→tracking all interactive; masks persist as project data so export = replay of the same operations. [P — ai.meta.com]
- **Quality preservation on share:** "share to Instagram with high-quality playback" — Edits→IG uses a first-party upload path; a 4K watermark-free export exists for off-platform. The industry-standard failure Meta avoids: preview looks crisp → exported/uploaded video gets double-compressed. [P — App Store listing]
- **HDR lesson generalizes:** parity failures happen at domain boundaries (10-bit vs SDR overlays) — Meta's fix was to render UI elements in the *output's* dynamic range, i.e., preview compositing must match export color space/bit depth. [P — engineering.fb.com 2023]
- **Safe zones** = preview-time fidelity feature: yellow guides show where IG/FB player chrome (username, caption, buttons) will occlude the video — the preview literally renders the destination's UI over your edit. [S — linxtechnews 2025-08-15; avocadosocial]
- Caveat: no public doc states "WYSIWYG bit-exact"; parity is inferred from shared engine + real-time effect requirements + safe-zone overlay design. Confidence: high on mechanism, moderate on bit-exactness.

---

## 6. STATE COVERAGE MATRIX (what Meta covers — the bar for a competitor)

| State | Meta's answer | Evidence |
|---|---|---|
| Mid-edit interruption | Projects auto-persist in Edits Projects tab; reel drafts survive restarts; story drafts 7-day local TTL | P/S |
| App kill during upload | Segment-level resume; resumable protocol w/ byte offset; container survives client restart (24h expiry) | E/P |
| Network loss | Per-segment retry; offset resume; post stays in failed state w/ retry affordance | E/D |
| Server processing lag | uploading→processing→publishing phases exposed; client polls, doesn't block UI; "finishing up" phase | P |
| Transcode failure | ERROR status_code; per-DAG-node retry server-side; client must create new container for hard fails | P/E |
| Offline editing | Edits is local-first (projects, timeline, AI cutouts on-device); only publish/insights need network | P (inferred from on-device SAM + local projects) |
| Partial success (multi-item) | Per-item state, retry individual failed item | D |
| Upload while app backgrounded | Background session continues; completion/failure via push notification | D (consistent observation) |
| Draft loss risk | Known weak point — user complaints re: lost caption work; drafts are local-only | D |

---

## 7. TRANSFERABLE MECHANISMS → React Native competitor implementation

| Mechanism | Why it works | Implementation approach (RN) | Expected lift |
|---|---|---|---|
| **Segmented upload + per-segment retry/resume** | Overlaps encode+upload; failure granularity = segment not file; survives app kill | Chunk on GOP/keyframe boundary (or fixed-size fallback); persist per-segment state (uploadId, offset, checksum) to SQLite/MMKV; upload queue via background task (expo-background-task / WorkManager); server accepts offset-resume | 2×+ latency cut, ~5× fewer failed uploads (IG's measured result) |
| **Explicit upload state machine** (idle→segmenting→uploading→processing→publishing→published / failed w/ retryable flag) | Users tolerate waits when the phase is named; "processing" ≠ "uploading" explains the 99% stall | Single source-of-truth reducer; UI renders phase label + determinate progress for upload, indeterminate-but-labeled for processing; persist machine state for cold-start restore | Fewer abandoned posts; perceived-reliability lift |
| **Optimistic post on own surface** (post appears instantly in "posting" state) | Hides latency entirely; feed returns instantly | Insert pending item into local feed/profile cache at share-tap; reconcile when published; keep retry affordance on the item itself | Feels instant; posting abandonment ↓ |
| **One shared render engine for preview+export** | What-you-see = what-you-get; effects debug once | RN: drive preview + export from the same scene-graph/ops list — preview renders ops in real time (Skia/Reanimated/GL), export replays ops through ffmpeg/native encoder; never maintain two render paths | Zero preview/export drift bugs; dev velocity |
| **Layered unified timeline** (clips+audio+text+stickers as movable layers on one screen) | IG's 2023 editor redesign — timing relationships visible at once | Vertical track stack; each overlay type = its own track w/ in/out points; tap-to-select, drag-to-retime | Editing comprehension ↑; fewer screen hops |
| **Frame-accurate trim w/ thumbnail filmstrip + snapping** | Precision without complexity | Filmstrip = decoded keyframe thumbnails; drag handles snap to frames + to beat markers/other-clip edges; haptic on snap | Perceived pro-grade tool |
| **Beat markers auto-detected on audio** | Aligning cuts to music is the #1 manual chore | Onset detection (native DSP or server precomputed for licensed tracks); render ticks on audio track; snap toggle | Faster edits; higher watch-time content |
| **Safe-zone overlay at preview time** | Prevents the most common "why is my caption behind the UI" failure | Toggleable guide layer replicating your own player chrome + system UI insets | Fewer re-edits/re-uploads |
| **Weekly feature-drop cadence + Beta tab** | Compound quality; creators surface demand | Feature-flag infra (remote config) + opt-in experiments surface; telemetry per tool | Retention via visible momentum |
| **On-device AI where latency matters** (segmentation, captions, denoise) | Interactive effects can't round-trip | CoreML/NNAPI via native modules; auto-suggest → tap-to-confirm → track pattern (not magic-wand-then-wait) | Pro features without pro UX cost |
| **Container-style publish handshake** (create→upload→poll→publish) | Decouples media bytes from metadata; publish is idempotent | Mirror API: `createUpload` → resumable byte PUT w/ offset → `status` poll w/ backoff → `publish`; dedupe key client-generated | No duplicate posts; clean retry semantics |
| **Background-post notification** | Frees user immediately; failure isn't silent | OS notification on completion/failure; tap → deep-link to retry sheet | Trust in background posting |
| **Draft persistence w/ explicit TTL where appropriate** | Stories 7-day local drafts: cheap, scoped; reels/projects: indefinite | Local store + restore-on-launch; surface "draft expiring" state if you add TTL; never silently drop (Meta's known complaint) | Fewer rage-quits from lost work |
| **Export progress overview** | Long renders need visibility; added Aug 2025 after launch complaints | Determinate export progress (frames rendered/total) + cancel + background continuation | Fewer export-abandon/retry loops |
| **Inspiration→creation loop** (trending audio feed inside editor; insights→next video) | Meta closed the analytics→action loop; AI assistant extends it | Embed trend/template rail; post-publish insights that deep-link back into editor with context | Creation frequency ↑ |

---

## 8. SOURCE REGISTER (primary evidence)

| # | URL | Publisher | Date | Class |
|---|---|---|---|---|
| 1 | about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/ | Meta | 2025-04-22 | P |
| 2 | creators.instagram.com/blog/edits-video-creation-app | Instagram Creators | 2025-04-22 | P |
| 3 | apps.apple.com/us/app/edits-video-editor/id6738967378 | App Store (v445 notes) | current | P |
| 4 | play.google.com/store/apps/details?id=com.instagram.basel | Play Store | current | P/D (reviews) |
| 5 | ai.meta.com/blog/instagram-edits-cutouts-segment-anything/ | Meta AI | 2025 | P |
| 6 | engineering.fb.com/2022/11/04/...instagram-video-processing-encoding-reduction/ | Engineering at Meta | 2022-11-04 | P |
| 7 | engineering.fb.com/2023/07/17/video-engineering/hdr-video-reels-meta/ | Engineering at Meta | 2023-07-17 | P |
| 8 | medium.com/@ningzh/video-scale-upload-unification-930c4fb5d804 | ex-IG Video Infra eng (Ning Zhang) | 2018-03-16 | E |
| 9 | oar.princeton.edu/.../VideoProcessing.pdf (SVE, SOSP'17) | Meta/Princeton | 2017 | E |
| 10 | developers.facebook.com/docs/instagram-platform/content-publishing/resumable-uploads/ | Meta for Developers | current | P |
| 11 | developers.facebook.com/docs/instagram-platform/.../error-codes/ | Meta for Developers | current | P |
| 12 | about.instagram.com/blog/engineering/making-instagram-video-ads-performant | Instagram Engineering | ~2022 | P |
| 13 | techcrunch.com/2026/06/11/metas-edits-app-is-getting-an-ai-assistant-and-a-desktop-version/ | TechCrunch | 2026-06-11 | S |
| 14 | techcrunch.com/2026/08/25/instagrams-first-draft-feature-aims-to-make-editing-reels-less-tedious/ | TechCrunch | 2026-08-25 | S |
| 15 | wired.com/story/instagram-edits-app-new-features/ | WIRED | 2025-05 | S |
| 16 | socialmediatoday.com/news/edits-gets-simplified-copy-and-paste-improved-track-linking/810642/ | Social Media Today | 2026-01-27 | S |
| 17 | socialmediatoday.com/news/instagram-edits-video-app-teleprompter-overlays-update/750386/ | SMT | 2025-06-10 | S |
| 18 | socialmediatoday.com/news/edits-gets-custom-captions-effects-color-correction/804699/ | SMT | 2025-11-04 | S |
| 19 | linxtechnews.com/2025/08/15/edits-gets-updated-reels-insights-safe-zone-mapping-and-more/ | Linx Tech | 2025-08-15 | S |
| 20 | thelinkx.com/edits-adds-new-audio-and-font-features | The Linkx | 2026-06-07 | S |
| 21 | gadgets360.com/apps/features/instagram-edits-app-one-year-anniversary-…-11393972 | Gadgets360 | 2026-04 | S (fetch 403; search-snippet verified) |
| 22 | linkedin.com/posts/hangyu-kuang… (Edits Graphics Rendering hiring post) | Meta employee | ~2026 | E |
| 23 | facebook.com/help/instagram/261360253626830 (reel clip editing) | IG Help Center | current | P |
| 24 | help.instagram.com/314684928883274 (story capture modes) | IG Help Center | current | P |
| 25 | about.fb.com/news/2024/05/new-stickers-in-instagram-stories/ | Meta | 2024-05 | P |
| 26 | 9to5mac.com/2025/10/23/instagram-stories-…-restyle-tool/ | 9to5Mac | 2025-10-23 | S |
| 27 | developers.facebook.com/community/threads/1166835024492940/ (stuck IN_PROGRESS) | Meta Dev Forum | 2024-25 | D |
| 28 | insights.vaizle.com/instagram-drafts/ (draft TTLs, local-only) | Vaizle | 2025 | S |
| 29 | instagram-engineering.com/bringing-wide-color-to-instagram-5a5481802d7d | IG Engineering (Krieger) | 2017 | P (historical pipeline) |
| 30 | kompozy.io/reviews/instagram-edits (Jul 2026 bilingual captions) | Kompozy | 2026-07 | S |

**Not used as primary:** instantviews.net "Algorithm Trust Score / cryptographic signature bypass" claims — SEO-grade, unverified, flagged as speculation only.

## 9. OPEN GAPS / LOW-CONFIDENCE ITEMS
1. Bit-exact preview↔export parity in Edits — inferred from shared engine, not documented. (moderate confidence)
2. Whether Edits→IG share uses GOP-segmented upload — presumed (same infra), unverified.
3. Stories upload path specifics (single-shot vs segmented) — 15–60s media likely below the <10MB simple-pipeline threshold; inferred.
4. Internal autosave cadence of Edits projects — user complaints suggest imperfect journaling; exact mechanism unknown.
5. Desktop Edits ship status as of 2026-09 — "coming soon" as of June; sync confirmed by secondary coverage.
