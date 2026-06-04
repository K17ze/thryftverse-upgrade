# Expo Go Smoke Test Checklist

> Generated for the chat rebuild validation sprint.
> **Goal**: Confirm every screen opens without red-screen errors and matches reference quality.

---

## How to Access the Diagnostic Screen

1. Make sure you are running a **dev build** (`__DEV__ === true`).
2. Open **Settings** (Profile tab → gear icon).
3. Scroll to the bottom.
4. Tap **"Runtime Smoke Test"** (bug icon).
5. You will see a grid of every crash-prone route.

---

## Terminal Logs to Watch

Before tapping any screen, open your terminal running Metro and run:

```bash
# Optional: tee logs to a file for easy copy-paste
npx expo start 2>&1 | tee expo-smoke-test.log
```

If a crash occurs, copy **everything** between these markers:

```
[DIAGNOSTIC CRASH] Screen: <ScreenName>
[DIAGNOSTIC CRASH] Params: {...}
[DIAGNOSTIC CRASH] Message: <message>
[DIAGNOSTIC CRASH] Stack:
 <stack trace>
```

Also screenshot the **red screen** on your device.

---

## Exact Tap Order

Tap each tile **one at a time**. After each tap:
- Wait for the screen to fully render (no loading skeletons left).
- Scroll down at least once.
- Tap one interactive element (button, row, card).
- Go back.
- Check Metro terminal for warnings/errors.

### Core Navigation
| # | Tile | Expected Result | Screenshot if |
|---|------|-----------------|---------------|
| 1 | **Home** | Loads feed, no blank white area, images render | Red screen, blank area, image crash |
| 2 | **Browse** | Category grid loads, scrollable | Red screen, empty grid |
| 3 | **Search** | Search tab opens, search bar visible | Red screen |
| 4 | **VisualSearch** | Camera/gallery picker opens (may need permission) | Crash on permission, red screen |

### Commerce / Sell
| # | Tile | Expected Result | Screenshot if |
|---|------|-----------------|---------------|
| 5 | **SellScreenV2** | Form loads, co-own toggle present | Red screen, form missing |
| 6 | **CreatePoster** | Poster creation UI loads | Red screen |
| 7 | **CreateLook** | Look creation UI loads | Red screen |
| 8 | **ItemDetail** | Opens first real listing from backend/mock. If "No Data Available" alert shows, that is **honest and correct** — screenshot anyway. | Red screen after alert dismiss |

### Chat (Focus Area)
| # | Tile | Expected Result | Screenshot if |
|---|------|-----------------|---------------|
| 9 | **Inbox** | Conversation list renders with card-style rows. No fake online dots. Swipeable rows work. | Red screen, blank list, raw IDs visible |
| 10 | **Chat DM** | Opens first real conversation. Messages render with proper bubble shadows. Composer pill visible at bottom. No online dot in header. | Red screen, blank chat, crash on send |
| 11 | **Chat Group** | Opens first group conversation. Header shows member count. No fake online dot. | Red screen, blank chat |
| 12 | **ChatSettings** | Settings list loads. Toggles animate. No missing rows. | Red screen |
| 13 | **BotDirectory** | Bot list loads (may be empty). Empty state honest. | Red screen |

### Profile / Settings
| # | Tile | Expected Result | Screenshot if |
|---|------|-----------------|---------------|
| 14 | **MyProfile** | Profile header loads, real avatar/cover, no fake wallet value, no fake badges. | Red screen, crash on scroll |
| 15 | **UserProfile** | Opens first known user from conversations. Honest info displayed. If "No Data Available" alert shows, that is **honest and correct**. | Red screen after alert dismiss |
| 16 | **Closet** | Closet grid loads. | Red screen |
| 17 | **MyOrders** | Orders list loads. Status colors render. | Red screen |
| 18 | **EditProfile** | Edit form loads with real current user data. | Red screen |
| 19 | **Settings** | Settings list loads with search bar. Identity card at top. | Red screen |
| 20 | **AccountSettings** | Account rows load. No hardcoded mock data (email, name, phone should come from store or show honest fallbacks). | Red screen, mock data visible |
| 21 | **PushNotifications** | Toggle list loads. All toggles interact. | Red screen |
| 22 | **PrivacySettings** | Privacy rows load. | Red screen |
| 23 | **BlockedUsers** | Blocked list loads (may be empty). | Red screen |
| 24 | **ActiveSessions** | Sessions list loads. | Red screen |
| 25 | **ChangePassword** | Password form loads with strength bar. | Red screen |
| 26 | **HelpSupport** | FAQ accordions + support message input. | Red screen |
| 27 | **TwoFactorSetup** | 2FA setup flow loads. | Red screen |

---

## Reference Quality Checklist

While testing the chat surfaces specifically, verify visually against the uploaded references (Instagram DM, WhatsApp, Telegram):

- [ ] **Header quality**: Avatar clear, name readable, no online dot, back button obvious.
- [ ] **Avatar fallback**: When no avatar URI, initials render cleanly (not blank, not raw ID).
- [ ] **Message grouping**: Same-sender bubbles cluster without excessive gaps. First/last in cluster have correct border radius.
- [ ] **Bubble shape**: Subtle shadow on both me/them bubbles. No harsh borders.
- [ ] **Composer quality**: Pill input with border and shadow. Send button has brand glow when active, muted when empty.
- [ ] **Media message layout**: Images/videos have rounded corners, error state if URI invalid (not crash).
- [ ] **Action drawer** (long-press a message): Copy, Reply, React, Select, Delete. All labeled. Destructive delete in red.
- [ ] **No fake online dots**: Confirm avatar in header and inbox rows do NOT show green dot.
- [ ] **No raw IDs**: Confirm no user IDs or conversation IDs are visible as plain text in UI.
- [ ] **No red-screen errors**: This is the gate — any red screen = BROKEN.

---

## What to Report Back

For each screen that fails, provide:

1. **Screen name**
2. **Screenshot** of the error / red screen / visual mismatch
3. **Terminal log** copied from `[DIAGNOSTIC CRASH]` markers (if crash) or relevant warning lines
4. **Expected vs Actual** (one sentence each)

For screens that pass, just say "PASS: <ScreenName>".

---

## Known Honest States (NOT bugs)

These are expected when store/backend has no data:

- `Chat DM` / `Chat Group` → "No Data Available" alert if you have zero conversations.
- `ItemDetail` → "No Data Available" alert if backend returns zero listings.
- `UserProfile` → "No Data Available" alert if no conversation participants exist.
- `BotDirectory` → Empty state illustration if `availableChatBots` array is empty.
- `MyOrders` → Empty state if no orders in store.

These are **honest UI**, not failures. The screen opening without a red screen is the success criterion.
