# FINAL PRODUCTION CONVERGENCE AUDIT — RELEASE GATE

**Audit Date:** 2025-07-01  
**Scope:** Full-stack frontend trace (Messaging, Inbox, Settings, Commerce, Security, Support)  
**Method:** Strict code-path tracing — every claim verified against actual component code, state flow, and API call presence. No assumptions accepted from previous reports.

---

## A. PRODUCTION READINESS SCORE (0–100)

| Domain | Score | Notes |
|--------|-------|-------|
| **Messaging** | **10 / 100** | Group chat text sending works via API. 1:1 DMs are local-only. Media is local-only. Delete is local-only. No delivered/read status. |
| **Inbox** | **70 / 100** | Real API load, skeleton loader, error retry, offline banner, swipe delete/pin. Missing archive/mute/block. |
| **Settings** | **40 / 100** | Hardcoded "1 saved" removed. Account preferences and postage are local-only. Active Devices row is a dead link. Blocked users missing. |
| **Commerce** | **45 / 100** | Payment methods list/add/delete work via API. Edit nickname and set-default are local-only. Postage preferences are local-only. |
| **Security** | **65 / 100** | 2FA enrollment/verify/disable are fully wired to real APIs. Account export and deletion work. No active session management. No blocked users. |
| **Support** | **20 / 100** | No support ticket API. Fake form and "My Tickets" removed. Only Live Chat (broken for DMs) and Email (mailto:) remain. |

**Overall Score: 42 / 100**

---

## B. BLOCKING ISSUES (must fix before ANY beta)

### B1. 1:1 DM TEXT MESSAGES ARE NEVER SENT TO THE BACKEND
**File:** `src/screens/ChatScreen.tsx` (lines 348–349)  
**Evidence:** `sendConversationMessageOnApi(conversationId, trimmed)` is wrapped inside `if (isGroup) { ... }`. For all non-group conversations, the outgoing message is pushed only to local React state (`setMessages`) and local Zustand store (`appendToConversationStore`).  
**Impact:** Messages sent in 1:1 chats disappear on app restart, on API sync (`fetchConversationMessagesFromApi`), or when the user opens the conversation on another device. The primary user-facing feature of the app is non-functional.

### B2. MEDIA MESSAGES ARE NEVER SENT TO THE BACKEND
**File:** `src/screens/ChatScreen.tsx` (lines 479–549)  
**Evidence:** `createMediaMessage` creates a local message with `mediaUri` and `uploadStatus: 'uploading'`. `simulateUpload` is a `setTimeout` that flips `uploadStatus` to `'sent'` after 2 seconds. There is no network request. `sendConversationMessageOnApi` only accepts `text: string` and `metadata: Record<string, unknown>` — no media upload endpoint exists.  
**Impact:** Photos and videos appear sent locally but are never transmitted. The recipient never receives them. The sender is actively misled by a "sent" checkmark.

### B3. MESSAGE DELETE IS LOCAL-ONLY (OTHER PARTICIPANTS STILL SEE IT)
**File:** `src/screens/ChatScreen.tsx` (lines 430–452, 454–470)  
**Evidence:** `handleBulkDelete` and `handleDeleteMessage` only call `setMessages((prev) => prev.filter(...))`. No API call to delete messages server-side. The undo banner tells the user "X messages deleted", implying removal for everyone.  
**Impact:** Users believe they deleted sensitive messages, but they remain visible to all other conversation participants.

### B4. PAYMENT METHOD EDIT & DEFAULT ARE NOT PERSISTED
**File:** `src/screens/PaymentsScreen.tsx` (lines 94–122)  
**Evidence:**
- `handleSetDefault` calls `setBackendPaymentMethods((prev) => prev.map(...))` — pure local state mutation.
- `handleEditLabel` calls `setBackendPaymentMethods((prev) => prev.map(...))` — pure local state mutation.
No PATCH or PUT endpoint is called. The `createUserPaymentMethod` and `deleteUserPaymentMethod` APIs exist, but edit/default have no backend integration.  
**Impact:** Users can change a nickname or set a default, but the change vanishes on next screen load because `syncPaymentMethods` fetches the original backend state.

### B5. POSTAGE PREFERENCES ARE LOCAL-ONLY
**File:** `src/store/useStore.ts` (lines 825–828), `src/screens/PostageScreen.tsx` (lines 91–94)  
**Evidence:** `updatePostagePreferences` is a Zustand setter that merges into local state. No API service function exists for saving postage preferences. The "Done" button in `PostageScreen` only calls `navigation.goBack()`.  
**Impact:** Carrier selection, free shipping, and bundle discount settings are lost on app reinstall and do not sync across devices.

### B6. ACCOUNT PREFERENCES ARE LOCAL-ONLY
**File:** `src/store/useStore.ts` (lines 813–816)  
**Evidence:** `updateAccountPreferences` is a Zustand setter. No API call for `holidayMode` or `privateProfile`.  
**Impact:** Privacy and seller-mode toggles do not persist to the backend.

### B7. MOCK DATA FALLBACKS IN PRODUCTION PATHS
**Files:** `src/screens/ChatScreen.tsx` (lines 280–285), `src/screens/InboxScreen.tsx` (lines 133, 202), `src/screens/BrowseScreen.tsx` (lines 82)  
**Evidence:**
- `ChatScreen`: `sellerUser = mockArrayOrEmpty(MOCK_USERS).find(...)`; `sellerLocation = sellerUser?.location ?? 'South Elmsall, UK'`; `sellerLastSeen = sellerUser?.lastSeen ?? '2h ago'`.
- `InboxScreen`: `seller = mockFind(MOCK_USERS, ...)` used for display titles.
- `BrowseScreen`: `seller = mockFind(MOCK_USERS, ...)` used for listing cards.
**Impact:** If the backend returns a `sellerId` not in the local cache, the app shows fake names, avatars, locations, and last-seen times to real users. This is active trust erosion.

### B8. FAKE ONLINE STATUS FOR ALL DM PARTNERS
**File:** `src/screens/ChatScreen.tsx` (line 733)  
**Evidence:** `isOnline={!isGroup}` — every direct message partner is rendered as permanently online.  
**Impact:** Users are misled about availability. Commerce negotiations may be initiated based on false presence data.

---

## C. HIGH RISK ISSUES (could damage trust in production)

### C1. Chat API ignores media fields from backend
**File:** `src/services/chatApi.ts` (lines 61–78)  
`mapApiMessageToConversationMessage` does not read `mediaUri` or `mediaType` from `ApiMessagePayload.metadata`. Even if the backend starts sending media messages, the frontend will not render them.

### C2. No blocked users / mute / archive UI
`archiveConversation` exists in `useStore.ts` but is not exposed in the Inbox UI. No blocked-user list, mute, or block action exists anywhere in the app.

### C3. Active Devices row is a dead link
**File:** `src/screens/SettingsScreen.tsx` (line 361)  
The "Active Devices" cell navigates to `AccountSettings`, which has no session list, no device enumeration, and no "Log out everywhere" functionality.

### C4. Account settings fake hydration
**File:** `src/screens/AccountSettingsScreen.tsx` (lines 69–72)  
`setTimeout(() => setIsHydrating(false), 400)` simulates a loading state. No actual data fetch occurs for the personal details form.

### C5. Inbox search scans potentially stale local messages
**File:** `src/screens/InboxScreen.tsx` (lines 139–145)  
Search corpus includes `conversation.messages.slice(-10)`. These messages may not be fully synced from the API, leading to incomplete or missing search results.

### C6. Support Live Chat navigates to a broken DM
**File:** `src/screens/HelpSupportScreen.tsx` (lines 43–48)  
`handleOpenLiveChat` navigates to `Chat` with hardcoded `conversationId: 'c1'`. Because DM sending is broken (B1), support messages sent via this path are also ephemeral.

---

## D. CLEAN AREAS (actually production-ready)

- **2FA Setup & Disable:** Fully wired to real APIs (`requestTwoFactorEnrollment`, `verifyTwoFactorEnrollment`, `disableTwoFactor`). QR code is generated from real `otpauthUrl`.
- **Auth System:** Login, signup, password reset, Google/Apple OAuth, magic link, and OTP are all backed by real `authApi.ts` endpoints with proper session persistence.
- **Account Data Export:** `requestMyDataExport` calls real `/users/me/export` endpoint.
- **Account Deletion:** `deleteMyAccount` calls real `DELETE /users/me` with logout and navigation reset.
- **Account Details Save:** `updateUserProfile` calls real `PATCH /users/me` with optimistic update and rollback on failure.
- **Inbox Loading & Refresh:** `fetchConversationsFromApi` is real. Skeleton loaders, error banners with retry, offline banners, and pull-to-refresh are all functional.
- **In-chat Search:** Text search with match counter and `scrollToIndex` is functional.
- **Offline Detection:** `NetInfo` integration is present and drives UI banners in both Chat and Inbox.
- **Payment Method Add/Remove:** `AddCardSheet` opens successfully. `deleteUserPaymentMethod` calls the real API. `listUserPaymentMethods` fetches from the real API.

---

## E. FINAL VERDICT

### ❌ NOT READY

**Justification:** The core 1:1 messaging system does not persist messages to the backend, payment and postage settings never reach the server, and multiple production paths still fall back to mock data, making the app actively misleading to real users.
