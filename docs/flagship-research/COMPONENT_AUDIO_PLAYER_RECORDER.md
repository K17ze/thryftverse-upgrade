# ThryftVerse Flagship Upgrade — Audio Player/Recorder Component

**Component deep-dive:** voice message recording (hold-to-record), voice message playback (waveform, speed), transcription, hands-free mode, audio compression.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### WhatsApp (2026)
- Hold-to-record + swipe up to cancel
- In-bubble playback: tap play, waveform animates
- Pause/resume: tap to pause, tap to resume
- Variable speed: 1x, 1.5x, 2x
- Auto-transcription (2026 feature)
- Hands-free: swipe up for hands-free mode

### Snapchat (2026)
- Hold-to-record, release to send
- Waveform visualization in bubble
- One-tap playback

### Telegram (2026)
- Voice messages with waveform
- Audio player for longer files
- Auto-transcription with language detection
- Video messages (round video alternative)

### Cross-cutting 2026 consensus
- Hold-to-record + swipe to cancel
- Waveform visualization in bubble
- One-tap play/pause
- Variable speed (1x, 1.5x, 2x)
- Auto-transcription
- Hands-free mode (swipe up)
- Recording duration timer

---

## 2. Psychology & Principles

### Voice as intimacy
Voice messages are more intimate than text — tone, emotion, personality. For marketplace: a seller describing an item in their voice builds more trust than text.

### Low-effort advantage
Voice is lower effort than typing for long explanations, non-native speakers, and one-handed use. One button press → talk.

### Waveform as progress
Waveform serves two purposes: visual representation (bubble feels alive) and progress indicator (played portion colored differently). More engaging than a progress bar.

### Transcription as accessibility
Auto-transcription makes voice accessible to: deaf users, noisy environments, can't-play-audio situations, and readers. 2026 standard: every voice message has transcription option.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/chat/VoiceMessagePlayer.tsx` | 196+ | Voice playback | ✅ Exists |
| `components/chat/VoiceMessageRecorder.tsx` | 171+ | Voice recording | ✅ Exists |
| `components/chat/VoiceMessageBubble.tsx` | 127+ | Voice bubble | ✅ Exists |
| `creator/core/audio/VoiceoverRecorder.ts` | 285+ | Voiceover recorder | ✅ Senior |
| `creator/core/audio/WaveformExtractor.ts` | 429+ | Waveform extraction | ✅ Senior |
| `creator/core/audio/AudioMixer.ts` | — | Audio mixing | ✅ Exists |
| `creator/poster/timeline/WaveformTrack.tsx` | 172+ | Waveform track | ✅ Exists |

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No auto-transcription** — no AI transcription | High |
| 2 | **No variable speed** — no 1.5x, 2x | Low |
| 3 | **No hands-free mode** — no swipe-up | Low |
| 4 | **No shared VoiceRecorder/VoicePlayer** — chat and creator are separate | Medium |
| 5 | **No voice in comments** — voice only in chat | Medium |
| 6 | **No audio compression** — no client-side compression | Medium |
| 7 | **No voice search** — no mic in search bar | Medium |

---

## 4. Micro Improvements

### M1 — Create shared VoiceRecorder component
```tsx
interface VoiceRecorderProps {
  onRecorded: (uri: string, duration: number) => void;
  maxDuration: number;  // default 60s
}
```
Hold-to-record, swipe up to cancel, swipe up for hands-free, live timer, waveform preview.

### M2 — Create shared VoicePlayer component
```tsx
interface VoicePlayerProps {
  uri: string;
  waveform: number[];
  transcription?: string;
  onPlaybackComplete: () => void;
}
```
Waveform display, play/pause, variable speed (1x, 1.5x, 2x), transcription toggle.

### M3 — Add auto-transcription
On-device speech recognition (iOS Speech, Android Speech-to-Text) or server-side API. Show transcription below waveform. Toggle to show/hide.

### M4 — Add variable speed
1x, 1.5x, 2x toggle. Tap speed icon to cycle. Persists per-user.

### M5 — Add hands-free mode
Swipe up on mic button during recording → hands-free. Recording continues without holding. Tap stop to finish.

### M6 — Add audio compression
AAC format, 64kbps, mono. Reduces upload size 70% without noticeable voice quality loss.

---

## 5. Macro Improvements

### A1 — Audio component system
- `VoiceRecorder` — shared recording (hold-to-record, hands-free, cancel)
- `VoicePlayer` — shared playback (waveform, speed, transcription)
- `Waveform` — shared waveform visualization
- `useAudioRecording` — hook for recording state
- `useAudioPlayback` — hook for playback state
- `useTranscription` — hook for auto-transcription

---

## 6. Flagship Acceptance Criteria

- **Shared VoiceRecorder** — hold-to-record, swipe-to-cancel, hands-free
- **Shared VoicePlayer** — waveform, play/pause, variable speed
- **Auto-transcription** — on all voice messages
- **Variable speed** — 1x, 1.5x, 2x
- **Hands-free mode** — swipe up
- **Audio compression** — AAC 64kbps mono
- **Waveform visualization** — in all voice bubbles
- **Recording timer** — live duration display
- **Accessibility** — transcription for deaf users, VoiceOver labels

### Thumbnail test
At 25% scale, voice bubble shows: waveform shape, play button, duration. Visually distinct from text bubble.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M3 — Auto-transcription | Medium | Accessibility |
| P1 | M1 — Shared VoiceRecorder | Low | All recording surfaces |
| P1 | M2 — Shared VoicePlayer | Low | All playback surfaces |
| P1 | M4 — Variable speed | Low | UX standard |
| P2 | M5 — Hands-free mode | Low | UX standard |
| P2 | M6 — Audio compression | Low | Upload performance |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `voiceBubble.minWidth` | 120pt | |
| `voiceBubble.maxWidth` | 240pt | |
| `voiceBubble.height` | 44pt | |
| `voiceBubble.radius` | Radius.lg | |
| `waveform.height` | 24pt | In bubble |
| `waveform.barWidth` | 2pt | |
| `waveform.barGap` | 1pt | |
| `waveform.color.played` | colors.brand | |
| `waveform.color.unplayed` | colors.textMuted | |
| `playButton.size` | 28pt | |
| `duration.font` | Type.caption | 12pt |
| `micButton.size` | 36pt | In composer |
| `micButton.haptic` | selection | On press |
| `recordingTimer.font` | Type.body-strong | Red |
| `speedToggle.options` | ['1x', '1.5x', '2x'] | |
| `transcription.font` | Type.caption | 12pt |
| `transcription.maxLines` | 3 | "more" to expand |
| `audio.format` | 'aac' | |
| `audio.bitrate` | 64kbps | Voice |
| `audio.channel` | 'mono' | |

---

*Generated 2026-08-18. Verified sources: blog.whatsapp.com/introducing-voice-message-transcripts (on-device transcription, Settings > Chats > Voice message transcripts, long-press → transcribe, rolling out globally), blog.whatsapp.com/making-voice-messages-better (out-of-chat playback, pause/resume recording, waveform visualization, draft preview, remember playback, 1.5x/2x fast playback), support.chatarchitect.com/books/meta-whatsapp/page/audio-messages-developer-documentation (Feb 2026: .ogg OPUS codec required, played status webhook March 2026, Automatic/Manual/Never transcript settings), transcribbit.io/blog/whatsapp-business-api-voice-transcription (July 2026: Business API cannot transcribe inbound voice notes, OPUS trap, 54 languages for call transcription). Production codebase audit: VoiceMessagePlayer, VoiceMessageRecorder, VoiceMessageBubble, VoiceoverRecorder, WaveformExtractor.*
