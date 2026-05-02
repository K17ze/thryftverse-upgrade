# Chat UI/UX Elevation Guide
## Thryftverse Chat Interface Benchmark Analysis

**Target:** Instagram, Telegram, WhatsApp, Depop, Pinterest  
**Goal:** Elevate chat to match industry leaders

---

## 1. Benchmark Analysis

### Instagram Direct
- **Product Cards:** Rich previews with image, price, quick-buy CTA
- **Visual First:** Media-heavy, minimal text chrome
- **Gestures:** Swipe to reply, long-press for reactions
- **Story Replies:** Visual context with story preview

### Telegram
- **Performance:** 60fps animations, instant delivery perception
- **Swipe Actions:** Right = reply, Left = actions, 80px threshold
- **Typing:** 3-dot wave, 300ms cycle
- **Entry Animation:** Fade + translateY(10px)

### WhatsApp
- **Status Icons:** Double check = delivered, Blue = read
- **Voice:** Waveform visualization, speed control
- **Threading:** Color-coded reply lines
- **Offline Queue:** Seamless message queuing

### Depop
- **Product Focus:** Item cards dominate conversation
- **Purchase CTA:** "Buy Now" buttons in chat
- **Offer Flow:** Negotiation interface integrated

---

## 2. Critical Improvements

### 2.1 Message List Performance
```typescript
// Current issue: transform warnings from Reanimated
// Fix: Separate animation wrapper from content
<MessageContainer entering={FadeIn.duration(200)}>
  <MessageContent /> // No layout animations here
</MessageContainer>
```

**Required:**
- [ ] Wrap message items in animated view wrapper
- [ ] Remove layout animations from inner content
- [ ] Use `RecyclerListView` or `FlashList` for chat
- [ ] Message recycling with stable IDs

### 2.2 Swipe Actions (Telegram Style)
```typescript
// Pan gesture handler for swipe-to-reply
const swipeGesture = Gesture.Pan()
  .activeOffsetX([-10, 10])
  .onUpdate((event) => {
    if (event.translationX > 80) {
      runOnJS(setReplyingTo)(messageId);
    }
  });
```

**Required:**
- [ ] Swipe right to reply (80px threshold)
- [ ] Haptic feedback on threshold
- [ ] Visual cue: reply icon appears during swipe
- [ ] Spring animation on release

### 2.3 Status Indicators (WhatsApp Standard)
```typescript
enum MessageStatus {
  SENDING = 'clock-outline',    // Single rotating
  SENT = 'checkmark-outline',   // Single check
  DELIVERED = 'checkmark-done-outline', // Double gray
  READ = 'checkmark-done',      // Double blue
  FAILED = 'alert-circle-outline'
}
```

**Required:**
- [ ] Bottom-right of outgoing bubbles
- [ ] 12px icon size
- [ ] Color-coded: gray → blue → red
- [ ] Timestamp below status

---

## 3. Visual System

### 3.1 Message Bubbles
| Property | Incoming | Outgoing |
|----------|----------|----------|
| Background | `Colors.surface` | `Colors.brand` (subtle) |
| Radius | 16px (top-left 4px) | 16px (top-right 4px) |
| Padding | 12px 16px | 12px 16px |
| Max Width | 75% | 75% |
| Shadow | None | 0 1px 2px rgba(0,0,0,0.05) |

### 3.2 Typography
```typescript
// Message text
fontSize: 16,
lineHeight: 22,
color: Colors.textPrimary,

// Timestamp
fontSize: 11,
color: Colors.textMuted,
marginTop: 4,

// Sender name (group chats)
fontSize: 13,
fontWeight: '600',
color: Colors.brand,
```

### 3.3 Avatar Sizing
```typescript
// Header
avatar: 36px,
statusDot: 10px,

// Message thread
avatar: 28px,
marginRight: 8px,

// Group chat
showAvatar: true,
position: 'left',
```

---

## 4. Media Handling

### 4.1 Image Messages (Instagram Style)
```typescript
interface ImageMessage {
  aspectRatio: number;      // Preserve original
  maxHeight: 300;
  borderRadius: 12;
  loading: 'blurhash';      // Blurhash placeholder
  tapToExpand: true;        // Fullscreen on tap
}
```

**Required:**
- [ ] Progressive loading with blurhash
- [ ] Multi-select with checkmarks
- [ ] Aspect ratio preservation
- [ ] Grid layout for multiple images

### 4.2 Voice Messages (WhatsApp + Telegram)
```typescript
interface VoiceMessage {
  waveform: number[];       // 40 bars normalized
  playbackSpeed: [1, 1.5, 2], // Toggle button
  duration: string;         // "0:42"
  progress: Animated.Value;
}
```

**Required:**
- [ ] Waveform visualization
- [ ] Pause/play with tap
- [ ] Drag to seek
- [ ] Speed toggle (1x → 1.5x → 2x)

---

## 5. Product Integration (Depop Style)

### 5.1 Product Cards in Chat
```typescript
interface ProductCardMessage {
  itemId: string;
  image: string;
  title: string;
  price: number;
  originalPrice?: number; // For offers
  condition: string;
  seller: UserPreview;
  actions: ['Buy Now', 'Make Offer', 'View Details'];
}
```

**Required:**
- [ ] Horizontal scroll for items
- [ ] Price with strikethrough on offers
- [ ] Quick action buttons
- [ ] "Sold" badge overlay

### 5.2 Offer Flow
```typescript
// Inline offer negotiation
interface OfferBubble {
  type: 'offer' | 'counter' | 'accept' | 'decline';
  amount: number;
  itemId: string;
  timestamp: Date;
  style: 'special' | 'normal'; // Gold accent for offers
}
```

---

## 6. Input Bar Excellence

### 6.1 Composer Design
```typescript
const ComposerStyles = {
  container: {
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 56,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 16,
  },
  sendButton: {
    size: 36,
    active: Colors.brand,
    inactive: Colors.textMuted,
    icon: 'send',
  },
};
```

**Required:**
- [ ] Auto-growing text input (max 5 lines)
- [ ] Send button appears only when text present
- [ ] Smooth height transitions
- [ ] @ mention suggestions with avatar

### 6.2 Attachments (Telegram Style)
```typescript
// Bottom sheet for attachments
const AttachmentMenu = {
  items: [
    { icon: 'image', label: 'Gallery', color: Colors.brand },
    { icon: 'camera', label: 'Camera', color: Colors.success },
    { icon: 'folder', label: 'File', color: Colors.warning },
    { icon: 'location', label: 'Location', color: Colors.error },
  ],
  layout: 'horizontal',
  animation: 'slideUp',
};
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Fix Reanimated transform warnings
- [ ] Implement FlashList for chat
- [ ] Add message status indicators
- [ ] Update bubble styling

### Phase 2: Interactions (Week 2)
- [ ] Swipe-to-reply gesture
- [ ] Long-press context menu
- [ ] Message reactions (emoji)
- [ ] Typing indicator animation

### Phase 3: Rich Content (Week 3)
- [ ] Product card messages
- [ ] Image gallery grid
- [ ] Voice message player
- [ ] Link previews

### Phase 4: Polish (Week 4)
- [ ] Haptic feedback integration
- [ ] Smooth scroll animations
- [ ] Pull to load more
- [ ] Search within chat

---

## 8. Accessibility Requirements

**WCAG 2.1 AA Compliance:**
- Touch targets: Minimum 44x44pt
- Message status: Alternative text for screen readers
- Voice messages: Transcription option
- Color contrast: 4.5:1 minimum for text

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Message list FPS | 55+ fps |
| Send latency (perceived) | < 100ms |
| Time to open chat | < 500ms |
| Voice message load | < 1s |
| Product card render | < 300ms |

---

**Next Steps:** Review Phase 1 items and begin with fixing animation warnings and implementing FlashList for chat messages.
