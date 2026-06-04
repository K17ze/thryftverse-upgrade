# 07 — Inbox & Chat Playbook

> Screens: `InboxScreen`, `ChatScreen`, `CreateGroupChatScreen`, `GroupBotDirectoryScreen`
> Reference images: **`inbox messages.png`** (conversations list) + **`message reference .jpeg`** (chat thread detail)
> Heritage plans: INBOX_UPGRADE_PLAN, AESTHETIC_CROSSCHECK_PLAN §3

---

## 1. Visual DNA (extracted from reference images)

### From `inbox messages.png`:
| Attribute | Spec |
|---|---|
| **Background** | `#0A0A0A` deep black |
| **Header** | Floating, semi-transparent with blur; title "Inbox" in bold white; 2 icon buttons (compose, search) glass-style |
| **Search bar** | Floating glass pill, full-width, `rgba(255,255,255,0.04)` bg with hairline border |
| **Segment control** | Glass pill container, 3 tabs (All / Unread / Groups), active = gold tinted background |
| **Message cards** | Glass cards, translucent + blur; 64px circular avatars with **gold ring for unread**; name in bold, snippet in muted gray, time on right |
| **Unread dot** | Small gold circle (8px), animated pulse for unread |
| **Online dot** | Small green circle (10px) on avatar bottom-right |
| **Pinned conversations** | Sorted to top, small pin icon next to name |
| **Swipe actions** | Soft gradient backgrounds (gold for pin, red for delete) instead of solid blocks |

### From `message reference .jpeg`:
| Attribute | Spec |
|---|---|
| **ChatHeader** | `BlurView` sticky header with avatar + name + online status |
| **Message bubble (me)** | `Colors.brand` (gold) with dark text — already premium |
| **Message bubble (them)** | Glass surface, translucent + blur, rounded with `borderBottomLeftRadius` tail |
| **Offer cards in chat** | Glass card, gold accent border |
| **Composer pill** | Glass pill with text input + gold send button |
| **Selection toolbar** | `GlassBottomBar` (floating, blur) |

---

## 2. Per-Screen Edits

### 2.1 `InboxScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/InboxScreen.tsx`

**Edits**:
1. **Header**: Replace solid `Colors.surface` block with `GlassHeader` (floating blur). Wire up `scrollY` shared value to crossfade header from transparent to glass over first 40px of scroll.
2. **Search bar**: Replace `AppInput` in solid `searchWrap` with `<GlassSearchPill />` (NEW component from 02 §19).
3. **Segment control**: Wrap `AppSegmentControl` in `GlassCard intensity={25} borderRadius={999}`; active chip = `Colors.brand` background, white text.
4. **Message cards**: Each row → `GlassCard intensity={30} borderRadius={20}`. Inside:
   - `AvatarRing size={56}` with `isUnread={item.unread}` (adds gold glow)
   - Online dot: 10px (was 14px)
   - Name: `Type.bodyEmphasis` in `Colors.textPrimary`, bold if unread
   - Snippet: `Type.caption` in `Colors.textSecondary`
   - Time: `Type.caption` in `Colors.textMuted`
   - Unread dot: `<PulseDot size={8} color={Colors.brand} />`
5. **Remove item preview row** (cramped thumbnail + price inside card). Keep inbox clean.
6. **Swipe actions**:
   - Pin: `backgroundColor: 'rgba(212,175,55,0.15)'` (was solid `Colors.brand`)
   - Delete: `backgroundColor: 'rgba(255,77,77,0.15)'` (was solid `Colors.danger`)
7. **Empty state**: Wrap icon in `GlowOrb` (size 120, gold, intensity 0.12); change icon to `mail-unread-outline`.
8. **List entrance**: Keep `FadeInDown` stagger.

**Result sketch**:
```tsx
<SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
  <GlassHeader scrollY={scrollY}>
    <View style={styles.headerRow}>
      <Text style={Type.title}>Inbox</Text>
      <View style={{ flexDirection: 'row', gap: Space.sm }}>
        <GlassIconButton icon="create-outline" onPress={handleCompose} />
        <GlassIconButton icon="search-outline" onPress={handleSearch} />
      </View>
    </View>
    <View style={{ marginTop: Space.md }}>
      <GlassSearchPill placeholder="Search messages" value={query} onChangeText={setQuery} />
    </View>
  </GlassHeader>

  <View style={{ paddingHorizontal: Space.md, marginVertical: Space.sm }}>
    <AppSegmentControl
      segments={[{ label: 'All', value: 'all' }, { label: 'Unread', value: 'unread' }, { label: 'Groups', value: 'groups' }]}
      value={filter} onChange={setFilter}
      variant="glass"
    />
  </View>

  <Animated.FlatList
    data={threads}
    keyExtractor={t => t.id}
    ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
    renderItem={({ item, index }) => (
      <Swipeable renderRightActions={() => <SwipeDeleteAction onPress={() => deleteThread(item.id)} />}>
        <FadeInDown delay={index * 45}>
          <AnimatedPressable onPress={() => openThread(item.id)}>
            <GlassCard intensity={30} borderRadius={20} style={{ padding: Space.md, flexDirection: 'row', alignItems: 'center' }}>
              <AvatarRing size={56} uri={item.avatar} isOnline={item.online} isUnread={item.unread} />
              <View style={{ flex: 1, marginLeft: Space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {item.pinned && <Ionicons name="pin" size={12} color={Colors.textMuted} style={{ marginRight: 4 }} />}
                  <Text style={{ ...Type.bodyEmphasis, color: item.unread ? Colors.textPrimary : Colors.textSecondary }}>
                    {item.name}
                  </Text>
                </View>
                <Text style={{ ...Type.caption, color: Colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                  {item.snippet}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ ...Type.caption, color: Colors.textMuted }}>{item.time}</Text>
                {item.unread && <View style={{ marginTop: 4 }}><PulseDot size={8} color={Colors.brand} /></View>}
              </View>
            </GlassCard>
          </AnimatedPressable>
        </FadeInDown>
      </Swipeable>
    )}
  />
</SafeAreaView>
```

### 2.2 `ChatScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/ChatScreen.tsx`

**Edits**:
1. **ChatHeader** (verify): `BlurView` + `AvatarRing` + name + online status. Already premium per audit.
2. **MessageBubble (me)**: keep `Colors.brand` (gold) — already correct.
3. **MessageBubble (them)**: `bubbleThem` style: `Colors.surface` → `GlassCard` (intensity=20, tint="dark", borderRadius=18, `borderBottomLeftRadius: 4` for tail).
4. **ComposerInput**: `pill` style `Colors.surface` → `GlassCard` (intensity=25, borderRadius=999). Keep gold send button.
5. **Offer/Status cards in chat**: `ChatCard variant="surface"` or `"tint"` → `GlassCard` (intensity=30); offer accepted = gold border.
6. **Date pills**: translucent `Glass.bgLight` background.
7. **Selection toolbar**: solid `Colors.background` row → `GlassBottomBar` (floating blur).
8. **List entrance**: `FadeInUp` for new messages.

### 2.3 `CreateGroupChatScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/CreateGroupChatScreen.tsx`

**Edits**:
1. Group name input: `AppInput variant="glass"`
2. Member selection list: each row = `GlassCard intensity={20}`; selected member = gold border + checkmark
3. Group photo picker: glass circle, dashed border
4. "Create Group" CTA: `AppButton variant="primary"` with `GlowSurface`
5. Add `FadeInUp` stagger

### 2.4 `GroupBotDirectoryScreen.tsx` (REFACTOR)

**File**: `frontend/src/screens/GroupBotDirectoryScreen.tsx`

**Edits**:
1. Group cards: `AppCard` → `GlassCard intensity={25} borderRadius={16}`
2. Each card: avatar (square with rounded corners, 56×56) + name + member count + description + Join button
3. Join button: `AppButton variant="secondary" size="sm"`; if joined, `variant="ghost"` showing "Joined ✓"
4. Filter chips at top: glass pills
5. Add `FadeInDown` stagger

---

## 3. Component Dependencies

| Component | Required For | Status |
|---|---|---|
| `GlassSearchPill` | Inbox search | ❌ Must create per 02 §19 |
| `GlassHeader` | Inbox sticky header | ✅ |
| `GlassCard` | All | ✅ |
| `AvatarRing` | All avatars | ✅ |
| `PulseDot` | Unread indicators | ✅ |
| `AppSegmentControl variant="glass"` | Inbox tabs | ❌ Add `variant` if missing |
| `GlassBottomBar` | Chat selection toolbar | ✅ |
| `AppInput variant="glass"` | CreateGroup | ❌ Enhance AppInput per 02 §3 |

---

## 4. Acceptance Criteria

- [ ] `InboxScreen` header uses `GlassHeader` with scroll-aware blur
- [ ] `InboxScreen` search bar uses `GlassSearchPill`
- [ ] All message cards use `GlassCard`
- [ ] All avatars use `AvatarRing` with `isUnread` for unread
- [ ] Unread indicator uses `PulseDot` (not static dot)
- [ ] Swipe actions use soft gradient backgrounds
- [ ] `ChatScreen` received bubbles use `GlassCard`
- [ ] `ChatScreen` composer uses `GlassCard`
- [ ] `ChatScreen` offer cards use `GlassCard`
- [ ] `ChatScreen` selection toolbar uses `GlassBottomBar`
- [ ] Empty states use `GlowOrb`
- [ ] All `FadeInDown`/`FadeInUp` staggers present
- [ ] `npm run typecheck` passes
- [ ] Visual diff vs `inbox messages.png` ≥ 90%
- [ ] Visual diff vs `message reference .jpeg` ≥ 90%

---

## 5. Feature Preservation Checklist

### InboxScreen
- [ ] Conversation list
- [ ] Search/filter
- [ ] All / Unread / Groups segment
- [ ] Swipe to delete (right) and pin (left)
- [ ] Unread dot and bold styling
- [ ] Draft indicator
- [ ] Pull-to-refresh
- [ ] Empty state with CTA
- [ ] Navigation to ChatScreen
- [ ] Mark as read on open
- [ ] Group chat avatar (people icon)
- [ ] Online indicator dot
- [ ] Pinned conversation sorting (pinned first)

### ChatScreen
- [ ] Message thread
- [ ] Send/receive text messages
- [ ] Image attachments
- [ ] Voice messages
- [ ] Offer cards (make/accept/counter)
- [ ] Item-tagged messages
- [ ] Read receipts
- [ ] Typing indicator
- [ ] Online status
- [ ] Pull older messages
- [ ] Message selection (multi-select)
- [ ] Delete selected
- [ ] Composer with attach + send

### CreateGroupChatScreen
- [ ] Group name input
- [ ] Group photo picker
- [ ] Member multi-select
- [ ] Create group
- [ ] Returns to Inbox with new group

### GroupBotDirectoryScreen
- [ ] Browse public groups
- [ ] Search groups
- [ ] Filter by category
- [ ] Join / Leave
- [ ] View group details

---

## 6. Reference Image Verification (TODO)

When `inbox messages.png` and `message reference .jpeg` are accessible, verify:

- [ ] Inbox: background is `#0A0A0A`
- [ ] Inbox: avatars have visible gold ring on unread threads
- [ ] Inbox: message cards appear translucent (not solid)
- [ ] Inbox: search bar is a glass pill, not a flat input
- [ ] Inbox: segment control is a glass pill with sliding indicator
- [ ] Chat: me bubbles are solid gold
- [ ] Chat: them bubbles are glassmorphism (not solid gray)
- [ ] Chat: composer pill is glassmorphism
- [ ] Chat: header has blur effect
- [ ] Chat: spacing between messages is generous

**If any spec doesn't match, update this doc before applying.**

---

**Next**: Read `08_PROFILE_AND_SOCIAL.md` for MyProfile, UserProfile, EditProfile, Closet screens.
