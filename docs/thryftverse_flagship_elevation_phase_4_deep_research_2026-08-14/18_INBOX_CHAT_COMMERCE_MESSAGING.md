# Inbox and Chat

## Code surfaces inspected / affected

- `frontend/src/screens/InboxScreen.tsx`
- `frontend/src/screens/ChatScreen.tsx`
- `frontend/src/hooks/chat/*`
- `frontend/src/components/chat/*`

## Current diagnosis


Inbox currently supports All, Unread, Groups, Buying, Selling, Requests and Archived semantics across segment logic. This is functionally rich but over-segmented.

Chat itself has strong decomposition and commerce context, but the remote audited version still visibly contains old Agent-chip/demo-era UI. Phase 3.1 is frozen as having fixed execution/consent; Phase 4 should focus on how agent participation *looks*.


## User psychology / product job


Messaging is high-frequency and muscle-memory driven.

Inbox: recognize person/context and urgency.
Chat: read and reply.
Commerce context: know which listing/order the conversation is about.
Agent: understand when a non-human participant is working and what it wants permission to do.

Everything else should be contextual.


## Flagship target composition


Inbox:
- Search.
- `Primary | Buying | Selling`.
- Requests as a row/badge entry.
- Unread as quick filter.
- Groups/Archived in overflow or secondary filter.

Chat:
- compact top identity;
- optional listing/order context bar;
- messages;
- composer.

No permanent agent-chip row.


## Detailed implementation map


1. Remove 6–7 equal segment states from default Inbox chrome.
2. Pinned/unread status expressed in row ordering and one subtle signal.
3. Listing context thumbnail in row is valuable for commerce; never add more than one contextual thumbnail/badge cluster.
4. Requests get separate route/sheet.
5. Agent participant:
   - avatar/name with `Agent` role text;
   - current working state inline above composer/message;
   - tool result appears as human-readable system event;
   - approval appears as explicit action card only when needed.
6. Draft reply visually belongs near composer, not indistinguishable from received/sent conversation bubbles.
7. Quick replies appear only when composer is empty and context supports them.
8. Safety warning uses one calm inline warning, not repeated badges on message + composer.
9. Offer cards remain distinct transaction objects.
10. Chat media viewer and keyboard transitions must be native-smooth.
11. Decouple bot/agent directory loading from Inbox startup if not required for rendering visible conversations.


## Micro-detail pass


- Conversation rows flat; no card background.
- Avatar 48–56 class, strong name, one-line snippet, time.
- Avoid an AI chip plus AI suffix plus special bubble color simultaneously; one role signal is enough.
- Date separators are quiet text, not pills.
- Composer uses one attachment entry + text + send; extra tools behind one expansion.


## Acceptance / screenshot QA


Pass:
- Inbox first viewport has ≤3 primary segments.
- Chat without special commerce/agent state looks as simple as a mainstream messenger.
- Agent approval cannot be mistaken for a sent message.


## Reference crosswalk


- User Instagram inbox capture: search, lightweight segments, flat avatar rows.
- Instagram Instants: camera/share path enters conversation with very low friction.
- Depop safety: keep communication/payment on-platform.
