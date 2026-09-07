/**
 * mentionParser — parse @mentions from chat input text.
 *
 * Supports:
 *   - @all — mention all group members (admin-gated on the backend)
 *   - @username — mention a specific user by display name
 *
 * Returns the mention ranges and a plain-text version with mention
 * markers for the backend to parse and send notifications.
 */
export interface MentionRange {
  /** Start index in the original text. */
  start: number;
  /** End index (exclusive). */
  end: number;
  /** The mention text without the @ prefix. */
  handle: string;
  /** Whether this is an @all mention. */
  isAll: boolean;
}

/**
 * Parse @mentions from the input text. Returns an array of mention
 * ranges sorted by position.
 *
 * A mention is:
 *   - @ followed by 1–30 word characters (letters, digits, underscores, hyphens)
 *   - @all is a special case
 *   - The @ must be at the start of the text or preceded by whitespace
 */
export function parseMentions(text: string): MentionRange[] {
  const mentions: MentionRange[] = [];
  // Match @handle where @ is at start or after whitespace.
  // The negative lookahead ensures the handle is exactly 1–30 chars
  // (not part of a longer word).
  const regex = /(?:^|\s)@([a-zA-Z0-9_-]{1,30})(?![a-zA-Z0-9_-])/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const atSignPos = match[0].startsWith('@') ? match.index : match.index + 1;
    const handle = match[1];
    mentions.push({
      start: atSignPos,
      end: atSignPos + handle.length + 1, // include the @
      handle,
      isAll: handle.toLowerCase() === 'all',
    });
  }
  return mentions.sort((a, b) => a.start - b.start);
}

/**
 * Extract the @mention handle being typed at the cursor position.
 * Returns null if no mention is in progress.
 *
 * Example: "Hello @ali" with cursor at the end returns "ali".
 */
export function extractMentionAtCursor(text: string, cursorPos: number): string | null {
  // Find the last @ before the cursor
  const beforeCursor = text.substring(0, cursorPos);
  const atIdx = beforeCursor.lastIndexOf('@');
  if (atIdx === -1) return null;
  // The @ must be at start or after whitespace
  if (atIdx > 0 && !/\s/.test(beforeCursor[atIdx - 1])) return null;
  // Extract the handle text after @
  const handleText = beforeCursor.substring(atIdx + 1);
  // Handle must be word characters only (no spaces)
  if (handleText.length === 0 || /[^a-zA-Z0-9_-]/.test(handleText)) return null;
  if (handleText.length > 30) return null;
  return handleText;
}

/**
 * Check if the text contains an @all mention.
 */
export function hasAllMention(text: string): boolean {
  return parseMentions(text).some((m) => m.isAll);
}

/**
 * Get all mentioned user handles (excluding @all).
 */
export function getMentionedHandles(text: string): string[] {
  return parseMentions(text)
    .filter((m) => !m.isAll)
    .map((m) => m.handle);
}
