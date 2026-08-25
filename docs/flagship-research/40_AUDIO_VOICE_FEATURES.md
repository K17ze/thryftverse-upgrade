# 40 — Audio & Voice Features: Flagship Research Report

> **Department:** Voice messages, audio recording, audio playback, voice search, voice notes, waveform display, audio in stories
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Snapchat · WhatsApp · Instagram · Telegram
> **Sources:** production codebase audit · 2026 web research · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### Snapchat (2026)
Snapchat pioneered voice messages in social apps:
- **Hold-to-record** — press and hold the mic button to record, release to send
- **One-tap playback** — tap the voice message bubble to play
- **Waveform visualization** — waveform displayed in the message bubble
- **Auto-delete** — voice messages can be set to auto-delete after playback

### WhatsApp (2026)
WhatsApp has the most polished voice message UX:
- **Hold-to-record + swipe to cancel** — hold mic to record, swipe up to cancel
- **In-bubble playback** — tap play, waveform animates as it plays
- **Pause/resume** — tap to pause, tap to resume
- **Variable speed** — 1x, 1.5x, 2x playback speed
- ** transcription** — auto-transcribed voice messages (2026 feature)
- **Hands-free recording** — swipe up to enter hands-free mode

### Instagram (2026)
Instagram voice messages in DMs:
- **Hold-to-record** — same pattern as Snapchat
- **Waveform in bubble** — visual representation of audio
- **One-tap play** — tap bubble to play, waveform animates

### Telegram (2026)
Telegram has the most advanced audio features:
- **Voice messages** — hold-to-record with waveform
- **Audio player** — dedicated audio player for longer audio files
- ** transcription** — auto-transcription with language detection
- **Video messages** — round video messages (alternative to voice)

### Cross-cutting 2026 consensus
- **Hold-to-record** — press and hold mic button, release to send
- **Swipe to cancel** — swipe up/left to cancel recording
- **Waveform visualization** — in the message bubble
- **One-tap playback** — tap to play, tap to pause
- **Variable speed** — 1x, 1.5x, 2x
- **Auto-transcription** — AI transcription for accessibility
- **Hands-free mode** — swipe up for hands-free recording
- **Recording duration** — live timer during recording

---

## 2. Psychology & Principles

### Voice as intimacy
Voice messages are more intimate than text — you hear the person's tone, emotion, and personality. For a marketplace, voice messages between buyers and sellers create a personal connection that text can't. A seller describing an item's condition in their own voice builds more trust than a text description.

### The low-effort advantage
Voice messages are lower effort than typing for many users — you press one button and talk. This is especially valuable for: longer explanations (describing an item's condition), non-native speakers (easier than typing), and one-handed use (walking, cooking).

### The waveform as progress
The waveform in a voice message bubble serves two purposes: it's a visual representation of the audio (making the bubble feel "alive") and it's a progress indicator (the played portion is colored differently). This is more engaging than a simple progress bar.

### Transcription as accessibility
Auto-transcription makes voice messages accessible to: deaf users, users in noisy environments, users who can't play audio (in a meeting), and users who prefer reading. The 2026 standard: every voice message should have an auto-transcription option.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Audio/voice files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/chat/VoiceMessagePlayer.tsx` | 196+ | Voice message playback | ✅ Exists |
| `components/chat/VoiceMessageRecorder.tsx` | 171+ | Voice message recording | ✅ Exists |
| `components/chat/VoiceMessageBubble.tsx` | 127+ | Voice message bubble | ✅ Exists |
| `components/chat/ChatComposerBar.tsx` | 262+ | Chat composer with voice | ✅ Exists |
| `components/chat/MessageBubble.tsx` | — | Message bubble (renders voice) | ✅ Exists |
| `creator/core/audio/VoiceoverRecorder.ts` | 285+ | Voiceover recorder (creator) | ✅ Senior |
| `creator/core/audio/WaveformExtractor.ts` | 429+ | Waveform extraction | ✅ Senior |
| `creator/core/audio/AudioMixer.ts` | — | Audio mixing | ✅ Exists |
| `creator/tools/audio/VoiceoverRecorderSheet.tsx` | 816+ | Voiceover recorder sheet | ✅ Substantial |
| `creator/tools/audio/AudioBrowserSheet.tsx` | 858+ | Audio browser | ✅ Substantial |
| `creator/tools/audio/AudioTypes.ts` | — | Audio types | ✅ Exists |
| `creator/poster/timeline/WaveformTrack.tsx` | 172+ | Waveform timeline track | ✅ Exists |
| `creator/poster/tools/AudioFadeControls.tsx` | 296+ | Audio fade controls | ✅ Exists |

### What exists (genuinely senior)
1. **Chat voice messages** — VoiceMessagePlayer (196 lines), VoiceMessageRecorder (171 lines), VoiceMessageBubble (127 lines). Full voice message support in chat.
2. **Creator audio system** — VoiceoverRecorder (285 lines), WaveformExtractor (429 lines), AudioMixer, VoiceoverRecorderSheet (816 lines), AudioBrowserSheet (858 lines). This is a **genuinely senior audio pipeline** for the creator tools.
3. **WaveformTrack** — 172-line waveform display for the poster timeline.
4. **AudioFadeControls** — 296-line audio fade in/out controls.
5. **ChatComposerBar** — 262-line chat composer with voice recording support.

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No voice search** — no voice input for search queries | Medium |
| 2 | **No auto-transcription** — no AI transcription for voice messages | High |
| 3 | **No variable speed playback** — no 1.5x, 2x option | Low |
| 4 | **No hands-free recording** — no swipe-up for hands-free mode | Low |
| 5 | **No voice messages in comments** — voice only in chat, not on looks/posters | Medium |
| 6 | **No audio in stories** — no background music or voiceover on poster stories (creator tools have it but stories may not) | Medium |
| 7 | **No voice-to-text for listings** — no dictation for listing descriptions | Low |
| 8 | **No shared VoiceMessage component** — chat voice is separate from creator voice | Low |
| 9 | **No voice message notifications** — no "new voice message" push with waveform preview | Low |
| 10 | **No audio compression** — no client-side compression for voice uploads | Medium |

---

## 4. Micro Improvements

### M1 — Add auto-transcription for voice messages
When a voice message is received, auto-transcribe it using on-device speech recognition (iOS Speech framework, Android Speech-to-Text) or server-side API. Show transcription below the waveform in the bubble. Toggle to show/hide.

### M2 — Add variable speed playback
1x, 1.5x, 2x speed toggle on voice message playback. Tap the speed icon to cycle. Persists per-user preference. Standard for 2026 voice UX.

### M3 — Add hands-free recording
Swipe up on the mic button during recording to enter hands-free mode. Recording continues without holding. Tap stop to finish. Standard WhatsApp pattern.

### M4 — Add voice search
Mic icon in the search bar. Tap to start voice input. Speech-to-text converts to search query. User can edit before searching. Integrates with GlobalSearchScreen.

### M5 — Add voice messages in comments
Allow voice messages as comments on looks and posters. Same VoiceMessageBubble component, rendered in the comment thread. Transcription shown below waveform.

### M6 — Add voice-to-text for listing descriptions
In SellScreen, add a mic icon next to the description field. Tap to dictate. Speech-to-text fills the field. User can edit. Useful for sellers who prefer talking over typing.

### M7 — Add audio compression for voice uploads
Compress voice recordings before upload: AAC format, 64kbps bitrate, mono channel. Reduces upload size by 70% without noticeable quality loss for voice.

---

## 5. Macro Improvements

### A1 — Unified audio platform
Create a shared audio system:
- `VoiceRecorder` — shared recording component (hold-to-record, hands-free, cancel)
- `VoicePlayer` — shared playback component (waveform, speed, transcription)
- `Waveform` — shared waveform visualization
- `useAudioRecording` — hook for recording state management
- `useAudioPlayback` — hook for playback state management
- `useTranscription` — hook for auto-transcription

### A2 — Voice as a first-class input
Voice should be available as an input everywhere:
- **Chat** — voice messages (already exists)
- **Comments** — voice comments on looks, posters, listings
- **Search** — voice search
- **Listings** — voice-to-text for descriptions
- **Reviews** — voice reviews (with transcription)
- **Support** — voice support tickets

---

## 6. Flagship Acceptance Criteria

- **Auto-transcription** on all voice messages
- **Variable speed** — 1x, 1.5x, 2x playback
- **Hands-free recording** — swipe up for hands-free
- **Voice search** — mic in search bar
- **Voice comments** — voice messages in comment threads
- **Voice-to-text for listings** — dictation in sell flow
- **Audio compression** — AAC 64kbps for uploads
- **Waveform visualization** — in all voice message bubbles
- **Hold-to-record + swipe to cancel** — standard pattern
- **Accessibility** — transcription for deaf users, VoiceOver labels

### Thumbnail test
At 25% scale, a voice message bubble must show: the waveform shape, the play button, and the duration. The waveform must be visually distinct from a text bubble.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Auto-transcription | Medium | Accessibility |
| P1 | M2 — Variable speed | Low | UX standard |
| P1 | M3 — Hands-free recording | Low | UX standard |
| P1 | M4 — Voice search | Medium | Search UX |
| P2 | M5 — Voice in comments | Medium | Comment richness |
| P2 | M6 — Voice-to-text for listings | Medium | Sell flow UX |
| P2 | M7 — Audio compression | Low | Upload performance |
| P3 | A1 — Unified audio platform | High | All audio surfaces |
| P3 | A2 — Voice as first-class input | High | Voice everywhere |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `voiceBubble.minWidth` | 120pt | Minimum bubble width |
| `voiceBubble.maxWidth` | 240pt | Maximum bubble width |
| `voiceBubble.height` | 44pt | Control.touchable |
| `voiceBubble.radius` | Radius.lg | |
| `waveform.height` | 24pt | In bubble |
| `waveform.barWidth` | 2pt | Each bar |
| `waveform.barGap` | 1pt | Between bars |
| `waveform.color.played` | colors.brand | Played portion |
| `waveform.color.unplayed` | colors.textMuted | Unplayed portion |
| `playButton.size` | 28pt | In bubble |
| `playButton.icon` | 'play' / 'pause' | |
| `duration.font` | Type.caption | 12pt |
| `duration.color` | colors.textMuted | |
| `micButton.size` | 36pt | In composer |
| `micButton.haptic` | selection | On press |
| `recordingTimer.font` | Type.body-strong | Red color |
| `speedToggle.options` | ['1x', '1.5x', '2x'] | |
| `transcription.font` | Type.caption | 12pt |
| `transcription.color` | colors.textMuted | |
| `transcription.maxLines` | 3 | Truncate with "more" |
| `audio.format` | 'aac' | |
| `audio.bitrate` | 64kbps | Voice quality |
| `audio.channel` | 'mono' | |

---

*Generated 2026-08-18. Verified sources: blog.whatsapp.com/introducing-voice-message-transcripts (on-device transcription, Settings > Chats > Voice message transcripts, select language, long-press → transcribe), blog.whatsapp.com/making-voice-messages-better (out-of-chat playback, pause/resume recording, waveform visualization, draft preview, remember playback, 1.5x/2x fast playback), support.chatarchitect.com/books/meta-whatsapp/page/audio-messages-developer-documentation (Feb 2026: .ogg OPUS codec required, played status webhook March 2026, Automatic/Manual/Never transcript settings), transcribbit.io/blog/whatsapp-business-api-voice-transcription (July 2026: WhatsApp Business API cannot transcribe inbound voice notes, OPUS trap, 54 languages for call transcription June 2026). Production codebase audit: VoiceMessagePlayer, VoiceMessageRecorder, VoiceMessageBubble, VoiceoverRecorder, WaveformExtractor, AudioMixer, ChatComposerBar.*
