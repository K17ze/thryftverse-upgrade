# Deep blueprint — Chat + Agents

Phase 3.1 closes the safety/runtime primitives. Phase 4 turns them into a product that feels obvious rather than “agent infrastructure inside chat.”

---

# 1. Agent role in conversation

An agent is not a magical second chat app.

It can:
- read allowed context;
- produce drafts;
- use tools;
- ask approval;
- return results.

The user should perceive this through simple states.

---

# 2. Session state model

```ts
type AgentPresentationState =
  | { kind: 'idle' }
  | { kind: 'working'; label: string; cancellable: boolean }
  | { kind: 'tool'; verb: string; object?: string }
  | { kind: 'draft'; messageId: string }
  | { kind: 'approval'; approvalId: string }
  | { kind: 'error'; retryable: boolean };
```

This presentation state is not the execution runtime; it is the UI projection.

---

# 3. Working state

Good:
`Archive Stylist is searching your Saved items…     Stop`

Bad:
`Executing tool saved.search(args...)`

Working row belongs close to composer because it explains why nothing has arrived yet.

No spinner card in middle of history unless the action itself should become a durable event.

---

# 4. Tool event

Durable only if relevant:
`Archive Stylist searched 26 saved items`

Transient:
`Searching saved items…`

Do not keep verbose tool events forever unless Audit/Activity needs them.

Agent Activity can hold full durable log.

---

# 5. Draft reply

Phase 3.1 behavior:
ephemeral until user sends.

Visual placement options:

### Recommended
Draft composer panel above normal composer:
```
Draft from Negotiator
“Would you take £85?”
[Edit]              [Send]
```

This better communicates “not yet in conversation” than rendering it as a normal history bubble.

If a bubble form is retained:
it must sit in a clearly separated local draft lane and never scroll into canonical history as if sent.

---

# 6. Approval card

## Read/draft permission
If the user already granted, no repeated card.

## Send/publish
Card:
```
Archive Stylist wants to send:
“...”
[Not now]   [Review & send]
```

For text send, user can edit.

## Financial
Never final-execute in card.

Example:
```
Negotiator wants to make an £85 offer
Item: Acne Studios jacket
[Not now]   [Review offer]
```

`Review offer` opens canonical Make Offer screen prefilled.

Auction:
`Review bid`

Wallet:
`Review conversion`

This visually enforces the broker rule.

---

# 7. Capability management

In Agent definition:
human groups.

### Access
`This chat`
`Saved items`
`Your listings`
`Orders`
`Wallet balance`

### Can prepare
`Reply drafts`
`Listing drafts`
`Looks/Posters`

### Can ask to do
`Send messages`
`Publish listings`

### Always requires confirmation
`Offers`
`Bids`
`Orders`
`Convert/withdraw`

Do not show enum strings.

---

# 8. Connections

Connections is an infrastructure settings surface. It should still look consumer-grade.

Root:
```
Connections
OpenAI                      Connected >
Anthropic                   Not connected >
Gemini                      Not connected >
Custom                      >
```

Below:
`Agent activity`
`Pause all agents`

No giant hero unless there is a severe connection issue.

Provider detail:
- status;
- masked key;
- model availability;
- verify/disconnect;
- security note.

---

# 9. Agent Directory

If there is a directory:
avoid generic SaaS marketplace cards.

Agent row/card needs:
- identity;
- one-sentence job;
- required access summary;
- Add/Use.

No ratings unless real.
No fabricated “popular” badges.

Categories:
few human jobs:
- Shopping
- Selling
- Styling
- Safety
- Custom

---

# 10. Agent visual identity

Use one consistent role cue:
- small `Agent` text;
- subtle icon/avatar style.

Do not combine:
- robot emoji;
- glowing gradient;
- AI chip;
- “powered by”;
- special animated border.

This is the “AI-made” anti-pattern.

---

# 11. Context scopes

Context is high-trust.

If an agent can read:
- current chat;
- saved;
- listings.

Show on agent detail:
`Access: This chat, Saved items`

In chat, don't keep three chips permanently.
Offer one disclosure:
`Using: This chat + Saved`

Tap to inspect/reduce.

---

# 12. Failure states

Provider offline:
`Agent is unavailable right now. Your message wasn't sent.`

Tool fail:
`Couldn't search Saved items. Retry`

Permission denied:
agent remains idle; no guilt copy.

Stop:
stops current run; retain any completed durable actions.

---

# 13. Privacy language

Concrete:
`Can read your Saved items`

Not:
`Accesses personal context`

Concrete:
`Provider key stays on this device`

Avoid broad guarantees unsupported by architecture.

---

# 14. Activity ledger visual

Chronological rows:
```
14:32  Negotiator prepared an offer draft
14:33  You approved sending a message
14:35  Negotiator searched your listings
```

Financial actions include amount/object.

Filter:
optional `Approvals | Actions` only if volume requires.

---

# 15. Chat visual cleanliness

Without agent activity, the chat must look like a normal chat.

Agent platform cannot permanently increase vertical chrome for every conversation.

This is a hard acceptance requirement.

---

# 16. QA scenarios

- no agent;
- one agent idle;
- working;
- stopped;
- draft;
- edit draft;
- send;
- publish approval;
- offer approval;
- denied;
- provider disconnected;
- runtime error.

Screen recording required for:
working → draft → user send.

Pass if an unfamiliar user can answer:
“Has this message been sent yet?”
“Will this spend money if I tap this?”
“What data can this agent see?”
without reading documentation.
