# 19 — Voice Messages and Audio Media: Principal Engineering Decision Record

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Messaging Platform + Native Media + Trust & Safety
**Status:** **P1 department; UI scaffolding exists, production vertical does not**
**Recommended status:** **PARTIAL — DURABLE AUDIO PIPELINE ABSENT**

---

## 1. Executive verdict

Voice messages are not a production capability in the baseline. ThryftVerse has a recorder component, two competing player components, fields in the local `Message` view model and an `audio` variant in cross-device composer-state attachments. None forms a working send/read pipeline.

The original report was directionally correct but missed critical implementation contradictions:

1. `ChatScreen.tsx` does not pass `onVoiceSend` into `ChatComposerBar`, so the mic is hidden.
2. The recorder is tap-to-start/tap-to-send (`VoiceMessageRecorder.tsx:238–239`), while visible/accessibility text says "Tap and hold" and "Slide left to cancel." There is no hold or slide gesture.
3. `onCancel` has no cancel implementation. Its effect at `VoiceMessageRecorder.tsx:247–253` is a no-op — the comment says "We handle cleanup in the return callback below" but no cancel action is performed.
4. If a future parent wires `onRecordingChange` to `isVoiceRecording`, `ChatComposerBar` replaces/unmounts the recorder when recording becomes true; the cleanup stops recording. The current component ownership cannot safely support its intended active-state UI.
5. `MessageBubble` renders `VoiceMessageBubble` without `onPlay`, so even a synthetic local voice item is not playable.
6. The backend send schema accepts only `text|image|video`; the frontend API has the same union.
7. Default S3 policy has no `audio/*` MIME type, and `uploadMedia(string)` classifies unknown extensions such as `.m4a` as `image/jpeg`.
8. The waveform is decorative — `generateDefaultWaveform` uses `Math.random()` (`VoiceMessageBubble.tsx:48`) and `PlayingBar` animates random heights (`VoiceMessageBubble.tsx:71`), implying audio evidence they do not have.

This is not solved by exposing the microphone. It requires one app-level recorder/player coordinator, a verified audio-asset contract, idempotent upload/finalize/send, deterministic waveform extraction, moderation/retention/access control, playback coordination, and accessible transcription states.

### 1.1 Maturity scorecard

| Capability | Score | Verdict |
|---|---:|---|
| Native recording primitive | 2.5/5 | Expo recorder/permission/audio mode exist; control semantics, errors, interruption and cancellation are incomplete |
| Composer integration | 0.5/5 | Callback is optional and absent from canonical ChatScreen; ownership would unmount active recorder if naively wired |
| Durable upload | 0.5/5 | General verified upload pipeline exists, but audio MIME policy and chat voice adapter are absent |
| Server message contract | 0/5 | Backend/frontend send types exclude voice/audio |
| Draft/retry/idempotency | 1.5/5 | Text/media `clientMessageId` and cross-device audio attachment scaffolding exist; no voice lifecycle uses them |
| Waveform | 0.5/5 | Bubble generates random decorative bars (`VoiceMessageBubble.tsx:48, 71`); not chat evidence |
| Playback | 0.5/5 | Two UI components exist; canonical bubble has no playback callback/controller |
| Transcription | 0/5 | No contract, worker, consent, provenance or UX |
| Moderation/safety | 0.5/5 | General media lifecycle exists; no audio-specific scanning/report evidence workflow |
| Accessibility | 1.5/5 | Labels exist but describe nonexistent gestures; no text alternative/transcript or seek actions |
| Privacy/deletion | 1.0/5 | Conversation membership exists generally; no audio asset authorization/retention propagation |
| Observability/SLOs | 0.5/5 | No voice journey telemetry or service objectives |
| **Overall** | **0.9/5** | **Useful primitives, no end-to-end product** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Recorder behavior

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `VoiceMessageRecorder.tsx` / props | 29–31 | `onSend?, onCancel?, onRecordingChange?` — all optional | Foundation |
| `VoiceMessageRecorder.tsx` / random bars | 63 | `Math.random() * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT)` — decorative recording levels | P1 anti-AI |
| `VoiceMessageRecorder.tsx` / handlePress | 207–245 | Tap to start, tap to stop and immediately `onSend?.(uri, durationMs)` (line 239) — no preview, no pause, no validation | P1 |
| `VoiceMessageRecorder.tsx` / cancel | 247–253 | `if (onCancel && isRecording) { /* comment only */ }` — no-op | **P0** |
| `VoiceMessageRecorder.tsx` / cleanup | 255– | Unmount stops active recorder but does not preserve/recover a draft or reset audio mode | P1 |
| `VoiceMessageRecorder.tsx` / a11y text | 274–275 | Accessibility says "tap-and-hold"; implementation is a tap toggle | **P0** |
| `VoiceRecordingIndicator.tsx` | — | Visible "Slide left to cancel" text has no pan gesture | **P0** |
| `VoiceRecordingIndicator.tsx` | — | Elapsed timer is an independent `Date.now` interval, not recorder status duration | P1 |

**Critical quote — no-op cancel (`VoiceMessageRecorder.tsx:247–253`):**
```ts
  // ── Cancel recording (called by parent via onCancel) ──────────────
  useEffect(() => {
    if (onCancel && isRecording) {
      // The parent may trigger onCancel by unmounting or switching
      // state. We handle cleanup in the return callback below.
    }
  }, [onCancel, isRecording]);
```
The `if` block contains only a comment. No cancel action is performed. The recording continues. The comment says "We handle cleanup in the return callback below" but the cleanup only stops the recorder — it doesn't delete the recording or notify the parent of cancellation.

**Critical quote — immediate send without preview (`VoiceMessageRecorder.tsx:236–239`):**
```ts
        const durationMs = Date.now() - recordStartRef.current;
        setIsRecording(false);
        if (uri) {
          onSend?.(uri, durationMs);
        }
```
Stop immediately calls `onSend?.(uri, durationMs)`. No preview, no pause, no validation, no durable draft. The user cannot review what they recorded before it's sent. This is a trust failure — users expect to verify before sending.

### 2.2 Composer ownership contradiction

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `ChatComposerBar.tsx` | 48–55 | Voice state/callbacks are parent inputs | Foundation |
| `ChatComposerBar.tsx` | 115–116 | Mic only exists when `onVoiceSend` exists and parent says not recording | P1 |
| `ChatComposerBar.tsx` | 191–216 | When parent says recording, composer renders indicator/cancel instead of recorder | **P0** |
| `ChatComposerBar.tsx` | 236–244 | Recorder calls `onRecordingChange(true)` through `onVoicePress` | Foundation |
| `ChatScreen.tsx` | ~1884 | Canonical screen passes text/attachment/camera props but no voice callbacks — mic is unreachable | **P0** |

**Critical quote — the ownership contradiction:**
If a parent wires `onRecordingChange` to set `isVoiceRecording=true`, `ChatComposerBar` at lines 191–216 renders the indicator/cancel UI instead of the recorder. The recorder is unmounted. Its cleanup effect stops the recording. The user's recording is lost. The component ownership cannot safely support its intended active-state UI. The recorder must move above the conditional render or into a controller hook.

### 2.3 Render/playback contradictions

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `hooks/chat/types.ts` | 9–21, 63–67 | Local model includes `type:'voice'`, URI, duration and waveform | Foundation |
| `ChatScreen.tsx` | 1336, 1446 | Screen recognizes voice fields and forwards duration/waveform | Foundation |
| `MessageBubble.tsx` | 258–264 | Renders `VoiceMessageBubble` without `onPlay`, `isPlaying` or progress | **P0** |
| `VoiceMessageBubble.tsx` | 45–50 | `generateDefaultWaveform` uses `Math.sin` + `Math.random()` — non-deterministic decorative bars | **P0** anti-AI |
| `VoiceMessageBubble.tsx` | 67–89 | `PlayingBar` animates `Math.random()` heights when `isPlaying` — fake audio evidence | **P0** anti-AI |
| `VoiceMessageBubble.tsx` | 125–128 | Missing waveform falls back to `generateDefaultWaveform(DEFAULT_BAR_COUNT)` | P1 |
| `VoiceMessagePlayer.tsx` | — | Separate seek/speed-capable visual player exists but is not canonical; no real audio engine connected | P1 |

**Critical quote — decorative waveform (`VoiceMessageBubble.tsx:45–50`):**
```ts
function generateDefaultWaveform(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / count;
    return 0.3 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.5 + Math.random() * 0.2;
  });
}
```
`Math.sin` + `Math.random()` — the waveform is decorative, not derived from audio data. It looks like real audio evidence but is random. Per AGENTS.md §4: this is decorative chrome over composition — a fake AI tell.

**Critical quote — random playing bars (`VoiceMessageBubble.tsx:67–71`):**
```ts
    if (isPlaying) {
      const timer = setTimeout(() => {
        height.value = withRepeat(
          withSequence(
            withTiming(BAR_MIN_HEIGHT + Math.random() * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT), {
```
When "playing," bars animate to random heights. This implies the bars represent real audio metering — they don't. It's pure decoration pretending to be evidence.

### 2.4 Backend/upload boundaries

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `index.ts` | 19962–20011 | Fastify/Zod message schema only permits `text`, `image`, `video` | **P0** |
| `chatApi.ts` | — | Client union also only permits `text\|image\|video` | **P0** |
| `lib/s3.ts` | 32–63 | Upload policy uses explicit content-type allowlist | Foundation |
| `config.ts` | — | Default S3 list allows images/videos/PDF; no `audio/*` | **P0** |
| `mediaUpload.ts` | 326–347 | URI-extension classifier maps only common images/mp4/mov; `.m4a/.aac/.ogg/.opus` falls to `image/jpeg` | **P0** |
| `chatComposerState.ts` | 26–39 | Pending attachments already include `kind:'audio'` with finalization/object key | Foundation |
| `chatComposerState.ts` | 210–269 | Composer state verifies finalization ownership/status/scope and rejects device-local references — strong reusable boundary | Foundation |

---

## 3. End-to-end flow traces

### 3.1 Current path

```text
ChatScreen
  → ChatComposerBar(no onVoiceSend)           [ChatScreen.tsx:~1884]
    → mic hidden                               [ChatComposerBar.tsx:115-116]

If component were isolated:
tap → permission → local cache recording       [VoiceMessageRecorder.tsx:207-218]
tap → onSend?.(uri, durationMs)                [VoiceMessageRecorder.tsx:239]
  → no preview/upload/finalization/message API
  → no cancel (onCancel is no-op)              [VoiceMessageRecorder.tsx:247-253]
```

### 3.2 Target send path

```text
gesture/controller
  → permission posture
  → recorder session(id, actual duration, interruption state)
  → local durable draft + preview + real local waveform
  → verified upload intent(audio MIME/size/scope)
  → object upload
  → finalization + media asset published/quarantined
  → POST voice message(assetId, finalizationId, clientMessageId)
  → membership/ownership/asset validation in one transaction
  → message + media reference + outbox commit
  → realtime delivery
  → async waveform/transcription/moderation updates
```

### 3.3 Target playback path

```text
message snapshot
  → authorized short-lived playback URL
  → one conversation-scoped player coordinator
  → buffer → play/pause/seek/speed/interruption/route change
  → remembered position (local, bounded)
  → transcript on demand
```

---

## 4. August 2026 benchmark research

### 4.1 WhatsApp voice message features — 2026 updates

| Source | Finding | ThryftVerse application |
|---|---|---|
| [WhatsApp Blog — Voice Message Transcripts, 2026](https://blog.whatsapp.com/introducing-voice-message-transcripts?lang=en) | Transcripts generated on-device so "no one else, not even WhatsApp, can hear or read your personal messages." Off by default; user selects language pack (~100-150MB). Long-press → "Transcribe" | ThryftVerse should model transcription as derived lifecycle data with on-device or privacy-preserving processing, explicit consent, and language selection |
| [WABetaInfo — Liquid Glass voice note player, Mar 2026](https://wabetainfo.com/whatsapp-is-working-on-liquid-glass-interface-for-voice-note-player/) | WhatsApp developing redesigned playback bar with 5-second rewind button | Consider quick-rewind as a playback affordance |
| [WhatsApp Blog — Making Voice Messages Even Better](https://blog.whatsapp.com/making-voice-messages-better?lang=en) | Features: out-of-chat playback, pause/resume recording, waveform visualization, draft preview, remembered playback, 1.5×/2× speed. 7 billion voice messages per day | These define contemporary baseline expectations; ThryftVerse should meet them with a calmer marketplace-specific composer |
| [AskYazi — Voice Note Transcription Guide, 2026](https://www.askyazi.com/articles/voice-note-transcription-whatsapp-guide) | "Off by default. Users must enable transcription manually and download a language pack." "Single language at a time." "Recipient-only. The sender receives no notification" | ThryftVerse transcription should be opt-in, single-language initially, recipient-side, with no sender notification |

### 4.2 Telegram and standards

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Telegram voice transcription API](https://core.telegram.org/api/transcribe) | Transcription is asynchronous with `pending`, stable transcription ID, updates and good/bad rating | Model transcription as derived lifecycle data, not a synchronous string or authoritative sender text |
| [W3C WCAG 2.2 audio-only guidance, 9 March 2026](https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded) | Prerecorded audio-only content needs an equivalent alternative so users who cannot hear it can access the information | Provide transcript/alternative affordance and honest unavailable/pending/error states |

### 4.3 Expo Audio SDK

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Expo Audio, SDK 57 docs](https://docs.expo.dev/versions/latest/sdk/audio/) | Supports recording/playback, permission inspection, audio modes and interruption status; recordings default to cache and can be moved to document storage; headphone/Bluetooth disconnect stops audio | Implement explicit permission/interruption/storage/route states and preserve unsent drafts before network work |

Benchmark caveat: WhatsApp/Telegram capabilities are product evidence, not permission to copy their visual styling or privacy claims. ThryftVerse must use its own authorized media architecture.

---

## 5. Capability, state and ownership matrix

| Concern | Current owner | Truth status | Target owner |
|---|---|---|---|
| Record session | recorder component | local/fragile | native audio session coordinator |
| Recording UI state | child + hypothetical parent | contradictory | coordinator state machine |
| Draft file | Expo cache URI | ephemeral | encrypted/local app draft store |
| Upload | none for voice | absent | verified media upload service |
| Audio metadata | wall clock + random waveform | untrusted | media analyzer/decoder |
| Message identity | generic clientMessageId capability | available | messaging service |
| Asset authorization | none for voice | absent | media refs + conversation membership |
| Playback | bubble UI (`VoiceMessageBubble.tsx`) | nonfunctional | player coordinator + audio engine |
| Transcript | none | absent | transcription worker, user-controlled |
| Moderation | general media primitives | unbound | audio safety pipeline/human review |
| Delete/block retention | no audio propagation | absent | messaging + media lifecycle policy |

---

## 6. User psychology, JTBD and trust

Voice is high-emotion and high-ambiguity. People use it when typing is costly, nuance matters or accessibility/mobility favors speech.

### 6.1 Jobs

1. "Capture this thought quickly without accidental send."
2. "Let me verify what I recorded."
3. "Deliver it once even on poor mobile networks."
4. "Let me listen at my pace without losing position."
5. "Give me a text alternative when I cannot listen."
6. "Keep intimate audio limited to the intended conversation."

### 6.2 Trust failures

- Gesture copy that does not match behavior ("Tap and hold" / "Slide left to cancel" with no such gestures).
- Automatic send immediately after stopping, with no preview (`VoiceMessageRecorder.tsx:239`).
- Recording that vanishes when app backgrounds/storage is pressured.
- Decorative waveform pretending to represent speech (`VoiceMessageBubble.tsx:48, 71`).
- Failed upload shown as failed message when outcome is unknown.
- Transcript presented as exact sender words.
- Deleted/blocked audio still accessible by a public URL.

---

## 7. Strict anti-AI flagship UX specification

### 7.1 Composer state sequence

```text
idle composer:     [ + ] [ Message…                      ] [mic]
recording:         [cancel]  0:18  —functional levels—  [pause] [stop]
preview:           [delete] [play waveform 0:18] [send]
uploading:         [play preview] Uploading 42%          [cancel upload]
failed:            [play preview] Couldn't send         [retry] [delete]
unknown:           [play preview] Checking delivery…    [check]
```

- Recording replaces the input; it does not stack a floating card over the composer.
- Use explicit tap start/stop for accessibility, or fully implement hold/lock/slide semantics. Never describe one and ship another.
- Preview before send is default. An optional "quick send" setting is a later product decision, not initial behavior.
- Functional waveform only; otherwise render a quiet progress line. Remove `Math.random()` bars (`VoiceMessageBubble.tsx:48, 71`).

### 7.2 Motion/haptics

- Start/stop/cancel/send use distinct restrained haptics.
- No continuously bouncing/pulsing mic; system recording indicator and elapsed time are sufficient.
- Waveform progress fills without random animation.
- Reduced motion disables waveform interpolation while retaining playhead/state.

### 7.3 Accessibility

- Every operation is available without a drag gesture: start, pause, resume, stop, cancel, preview, send.
- Bubble exposes play/pause, seek forward/back and speed as screen-reader actions.
- Duration and buffered/error state are announced without per-second chatter.
- Transcript is adjacent, labelled "Automatically transcribed" with pending/failure/correction/report.
- Permission denial distinguishes undetermined/denied/restricted and offers Settings only when actionable.
- Large Text preserves composer actions and transcript readability.

---

## 8. Complete state machines

### Recording

```text
unavailable | permission_unknown
permission_unknown → requesting → denied | ready
ready → preparing → recording
recording → paused ↔ recording
recording|paused → stopping → preview_ready
recording|paused → cancelling → deleted
recording → interrupted(reason) → recoverable_preview | failed
any active → app_backgrounded(policy) | media_services_reset | low_storage
```

### Send/upload

```text
local_draft
 → presigning
 → uploading(progress)
 → finalizing
 → asset_ready
 → sending(clientMessageId)
   → accepted(messageId)
   → rejected(asset/policy/membership)
   → unknown(response lost)
unknown → GET by clientMessageId/finalization → accepted|not_sent|processing
not_sent → retry same clientMessageId and finalized asset
```

Upload success and message success are separate. Preserve finalized orphan for a bounded retry window; garbage-collect only after reference check and retention.

### Playback

```text
idle → authorizing_url → buffering → playing ↔ paused → ended
buffering|playing → route_changed/interrupted → paused
any → auth_expired(re-authorize) | unavailable | deleted | blocked
```

Only one chat voice item plays at once. Starting another pauses the first. Conversation change/unmount releases listeners and timers.

### Transcription

```text
not_requested → queued → processing(partial?) → complete
                           ↘ failed_retryable | failed_final | unsupported_language
complete → rated_good|rated_bad → corrected/reported (policy decision)
```

---

## 9. Target contracts and schema

```ts
interface VoiceAttachmentV1 {
  mediaAssetId: string;
  finalizationId: string;
  durationMs: number;
  bytes: number;
  container: 'm4a' | 'ogg' | 'webm';
  codec: 'aac' | 'opus';
  waveform: { version: 1; samples: number[] } | null;
  transcription: {
    id: string;
    state: 'queued' | 'processing' | 'complete' | 'failed' | 'unsupported';
    text: string | null;
    language: string | null;
    modelId: string | null;
    modelVersion: string | null;
    derived: true;
  } | null;
  moderationState: 'pending' | 'allowed' | 'limited' | 'blocked';
}

type SendVoiceMessage = {
  type: 'voice';
  clientMessageId: string;
  finalizationId: string;
  mediaAssetId: string;
  expectedDurationMs: number;
  replyToMessageId?: string;
};
```

Server transaction verifies membership, sender ownership, finalization scope/ref, published media state, allowed MIME/codec/bytes/duration, no prior message reference conflict and matching client idempotency hash. It inserts message + media reference + outbox together. Device URI and client-supplied playback URL are rejected.

### Storage/media policy

- Explicit allowed types: evaluate `audio/mp4`/M4A AAC and `audio/ogg`/Opus per platform playback compatibility. Do not accept arbitrary audio.
- Separate audio size/duration limits from "document" limits.
- Decode actual file to verify container, codec, duration, sample rate/channels and reject polyglot/mismatch.
- Private objects; short-lived authorized URLs tied to membership. CDN cache rules must not make removed audio public.
- Normalize waveform from decoded PCM into bounded 32–80 samples with algorithm version.
- Virus/content safety jobs and report evidence reference immutable asset hash.

---

## 10. Security, privacy and threat analysis

| Threat/failure | Current exposure | Required control |
|---|---|---|
| MIME spoof/polyglot | `mediaUpload.ts:326–347` — extension-based classification | Magic-byte/decoder verification, not extension/header trust |
| Oversize/decompression abuse | No audio limits | Upload bytes, decoded duration/sample bounds and worker resource limits |
| Cross-conversation asset reuse | No voice asset binding | Owner + finalization scope + conversation ref validation |
| Public URL leakage | No audio URL policy | Private storage, short TTL auth URL, membership recheck |
| Replay/duplicate send | `clientMessageId` exists for text | clientMessageId + payload hash + unique constraint |
| Unknown network outcome | No voice lifecycle | Status lookup/retry same key; never create a new key automatically |
| Orphan growth | No voice assets | Reference-aware TTL GC and quarantine retention |
| Malicious audio | No audio moderation | Moderation/report flow, rate limits, blocking access propagation |
| Transcript privacy | No transcription | Explicit processing policy, encrypted content, retention/deletion propagation |
| Transcript hallucination | No transcription | Derived label, confidence/internal telemetry, rate/correct/report |
| Deleted/blocked user access | No audio propagation | Media authorization checks current membership/block/delete policy |
| Background microphone abuse | No background policy | Background recording off by default, clear system/app indicator |
| Random waveform as evidence | `VoiceMessageBubble.tsx:48, 71` — `Math.random()` | Real decoded waveform or honest progress line |
| No-op cancel | `VoiceMessageRecorder.tsx:247–253` | Implement actual cancel with recording deletion |
| Gesture/text mismatch | `VoiceMessageRecorder.tsx:274–275` | Match copy to implementation or implement described gestures |

---

## 11. SLOs, SLIs and observability

| Journey | SLI | Target |
|---|---|---:|
| Recorder start | tap → recording-ready p95/p99 | ≤250 ms / ≤600 ms after permission |
| Local draft durability | stopped recordings persisted before network | 99.99% |
| Upload success | eligible ≤2 min messages on normal network | ≥99.5% |
| Send idempotency | duplicate messages for same client ID | 0 |
| Send accept latency | asset ready → message accepted p95/p99 | ≤400 ms / ≤1 s |
| Playback start | tap → audible p95/p99 on warm network | ≤500 ms / ≤1.5 s |
| Waveform readiness | finalized → samples p99 | ≤10 s |
| Transcription | ≤2 min audio complete p95 | ≤30 s (provider/model dependent) |
| Access revocation | deletion/block → URL denied p99 | ≤5 s |
| Crash/leak | active audio listeners/timers after screen close | 0 |

Telemetry: permission outcome, recorder prepare latency, interruption reason, draft recovered, upload/finalize/send states, unknown reconciliation, playback buffer/failure, transcript lifecycle and access-denied reason. Never log URI query secrets, audio bytes, transcript/body or microphone-level samples.

---

## 12. Migration, flags, compatibility and rollback

### Flags

```text
chat_voice_recording
chat_voice_upload_v1
chat_voice_playback_v1
chat_voice_waveform_v1
chat_voice_transcription_v1
```

### Phase 0 — truthful disable and contract

- Keep mic hidden in production until vertical is ready.
- Remove misleading hold/slide copy from reusable component or implement actual gestures (`VoiceMessageRecorder.tsx:274–275`).
- Implement actual cancel (`VoiceMessageRecorder.tsx:247–253`).
- Remove `Math.random()` waveform (`VoiceMessageBubble.tsx:48, 71`).
- Consolidate recorder ownership in an app-level/controller hook.
- Select container/codec/MIME/duration limits and privacy/moderation policy.

### Phase 1 — verified asset and durable send

- Add audio MIME/size policy, decoding verification and audio media derivative metadata.
- Extend chat send schema with discriminated `voice` contract and media ref table.
- Reuse composer-state finalization verification (`chatComposerState.ts:210–269`).
- Add preview, durable local draft and idempotent upload/finalize/send.

### Phase 2 — canonical playback/waveform

- Delete/converge two player components into one canonical bubble + player coordinator.
- Real decoded waveform worker and non-decorative fallback.
- Buffer, seek, speed, remembered position, route/interruption handling.

### Phase 3 — transcription/safety

- Async opt-in/on-demand transcription with provenance and rating (per WhatsApp's on-device model).
- Audio moderation/report/evidence retention and deletion propagation.
- Accessibility audit against WCAG/native assistive technology.

Rollout receive-before-send: new clients first render server voice messages; then internal send; then cohort send. Rollback disables creation while preserving playback of accepted messages. Never roll back schema fields or make existing assets inaccessible without a compatible renderer.

---

## 13. File/owner/dependency map

| Work | Canonical files | Owner/dependency |
|---|---|---|
| Recorder controller | `VoiceMessageRecorder.tsx` (lines 239, 247–253, 274–275), new chat audio hook, `ChatComposerBar.tsx` | Native Media/Mobile |
| Canonical wiring | `ChatScreen.tsx` (~1884), composer hooks/types | Messaging Mobile |
| Upload policy | `config.ts`, `lib/s3.ts`, uploads/media routes, `mediaUpload.ts` (lines 326–347) | Media Platform |
| Message contract | chat route in `index.ts` (lines 19962–20011), `chatApi.ts`, migrations | Messaging Platform |
| Draft/outbox | composer state route/service + local durable queue | Mobile Platform |
| Player | `VoiceMessageBubble.tsx` (lines 48, 71); retire/converge `VoiceMessagePlayer.tsx` | Native Media |
| Waveform/transcription | worker queues, media metadata, message update events | Media/ML Platform |
| Moderation/privacy | media lifecycle, reports, authorization | Trust & Safety/Privacy |

---

## 14. Test and release gates

- Canonical ChatScreen exposes mic only when backend capability handshake says supported.
- Tap/hold/cancel labels exactly match implemented gesture on iOS/Android.
- Permission denied/restricted, phone call, Siri/assistant, Bluetooth disconnect, media-services reset, background and low storage tests.
- Stop creates durable preview before any upload.
- MIME spoof, duration mismatch, oversize and cross-conversation finalization are rejected.
- Response loss after upload/send reconciles to exactly one asset/message.
- App kill during record, upload, finalize and send recovers truthful draft/state.
- Waveform is deterministic from decoded samples; no random fallback.
- Exactly one player active; seek/speed/remembered position and listener cleanup pass.
- Delete/block/membership removal denies playback under policy.
- Transcription pending/failure/unsupported/correction states pass.
- VoiceOver/TalkBack and large text can perform every operation without gestures alone.
- Native render/capture loop on physical low/mid/high-end devices; no web-only signoff.

---

## 15. Explicit non-goals

- Shipping a microphone button before the vertical is durable.
- Decorative "AI waveform" or transcript animation.
- Guaranteed perfect transcription.
- Background recording by default.
- Public permanent audio URLs.
- End-to-end encryption claims not implemented by the wider messaging architecture.

---

## 16. Decisions requiring product, legal/trust and operations input

1. Tap-toggle versus hold/lock/slide gesture; all actions must remain accessible.
2. Mandatory preview versus optional quick send.
3. Codec/container matrix and maximum duration/bytes.
4. Transcription default, consent, provider/region, retention and correction policy.
5. Audio moderation model, human review and evidence retention.
6. Deletion semantics for sender, recipient, reports/legal holds and backups.
7. Background playback/recording and earpiece/proximity scope.

---

## 17. Priority decision summary

| Priority | Decision |
|---:|---|
| **P0** | Build verified audio asset + discriminated server message contract before exposing mic (`index.ts:19962–20011`, `chatApi.ts`) |
| **P0** | Fix recorder ownership; current intended parent state would unmount active recorder (`ChatComposerBar.tsx:191–216`) |
| **P0** | Implement actual cancel (`VoiceMessageRecorder.tsx:247–253` is a no-op) |
| **P0** | Remove random waveform (`VoiceMessageBubble.tsx:48, 71`) and nonexistent gesture claims (`VoiceMessageRecorder.tsx:274–275`) |
| **P0** | Add durable preview/upload/finalize/send with idempotent unknown-outcome recovery |
| **P1** | Add canonical player coordinator, seek/speed/interruption and access revocation |
| **P1** | Add derived transcription (per WhatsApp's on-device model) and audio safety/privacy lifecycle |

---

## 18. Final assessment

**Voice messaging is currently scaffolding, not a partially wired feature.** The mic is hidden because `ChatScreen.tsx` doesn't pass `onVoiceSend`. The recorder sends immediately on stop with no preview (`VoiceMessageRecorder.tsx:239`). Cancel is a no-op (`VoiceMessageRecorder.tsx:247–253`). The waveform is `Math.random()` decoration (`VoiceMessageBubble.tsx:48, 71`). The backend doesn't accept voice messages (`index.ts:19962–20011`). S3 policy doesn't allow audio MIME types. `mediaUpload.ts` classifies `.m4a` as `image/jpeg`. But the correct foundation is already visible in the verified upload/finalization system, composer-state audio attachment schema (`chatComposerState.ts:26–39`) and message idempotency pattern. Reuse those boundaries, replace component-local audio ownership with a real state machine, remove the decorative waveform and false gesture claims, and keep the mic hidden until an app kill, dropped response, blocked user and accessibility audit all preserve truth.
