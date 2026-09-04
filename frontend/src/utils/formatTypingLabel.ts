/**
 * formatTypingLabel — build a human-readable typing subtitle from the set
 * of typing user IDs and the conversation's participant profiles.
 *
 * Matches the WhatsApp 2026 / Telegram / iMessage pattern:
 *   1 typer  → "Alice is typing…"
 *   2 typers → "Alice and Bob are typing…"
 *   3 typers → "Alice, Bob and Cara are typing…"
 *   4+       → "4 people are typing…"
 *
 * Falls back to "typing…" when no display names can be resolved (e.g.
 * profiles not yet loaded), which is still better than "Someone is typing…"
 * because it avoids the impersonal "Someone".
 */
export function formatTypingLabel(
  typingUserIds: string[],
  participantProfiles: Array<{ id: string; displayName?: string | null; username?: string | null }>,
  currentUserId?: string,
): string | null {
  // Filter out self — we never show "you are typing" to yourself
  const others = typingUserIds.filter((id) => id !== currentUserId);
  if (others.length === 0) return null;

  // Resolve display names from participant profiles
  const names: string[] = [];
  for (const id of others) {
    const profile = participantProfiles.find((p) => p.id === id);
    const name = profile?.displayName ?? profile?.username;
    if (name) {
      names.push(name);
    }
  }

  // If we couldn't resolve any names, show a count-based label
  if (names.length === 0) {
    if (others.length === 1) return 'typing…';
    return `${others.length} people are typing…`;
  }

  // 4+ typers → count-based to avoid a long name list in the header subtitle
  if (names.length >= 4) {
    return `${others.length} people are typing…`;
  }

  if (names.length === 1) {
    return `${names[0]} is typing…`;
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing…`;
  }
  // 3 names: "Alice, Bob and Cara are typing…"
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are typing…`;
}
