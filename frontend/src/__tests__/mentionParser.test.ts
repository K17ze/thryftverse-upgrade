import { describe, it, expect } from 'vitest';
import {
  parseMentions,
  extractMentionAtCursor,
  hasAllMention,
  getMentionedHandles,
} from '../utils/mentionParser';

describe('mentionParser', () => {
  describe('parseMentions', () => {
    it('returns empty array for plain text without mentions', () => {
      expect(parseMentions('Hello world')).toEqual([]);
    });

    it('parses a single @mention', () => {
      const mentions = parseMentions('Hello @alice');
      expect(mentions).toHaveLength(1);
      expect(mentions[0].handle).toBe('alice');
      expect(mentions[0].isAll).toBe(false);
    });

    it('parses @all as a special mention', () => {
      const mentions = parseMentions('Hey @all check this out');
      expect(mentions).toHaveLength(1);
      expect(mentions[0].handle).toBe('all');
      expect(mentions[0].isAll).toBe(true);
    });

    it('parses multiple mentions', () => {
      const mentions = parseMentions('Hi @alice and @bob');
      expect(mentions).toHaveLength(2);
      expect(mentions[0].handle).toBe('alice');
      expect(mentions[1].handle).toBe('bob');
    });

    it('does not parse @ in email addresses', () => {
      const mentions = parseMentions('Contact me at user@example.com');
      expect(mentions).toHaveLength(0);
    });

    it('parses @mention at start of text', () => {
      const mentions = parseMentions('@alice hello');
      expect(mentions).toHaveLength(1);
      expect(mentions[0].handle).toBe('alice');
    });

    it('handles underscores and hyphens in handles', () => {
      const mentions = parseMentions('Hey @user_name-123');
      expect(mentions).toHaveLength(1);
      expect(mentions[0].handle).toBe('user_name-123');
    });

    it('limits handle length to 30 chars', () => {
      const longHandle = 'a'.repeat(31);
      const mentions = parseMentions(`@${longHandle}`);
      expect(mentions).toHaveLength(0);
    });
  });

  describe('extractMentionAtCursor', () => {
    it('returns null for empty text', () => {
      expect(extractMentionAtCursor('', 0)).toBeNull();
    });

    it('returns null when no @ is present', () => {
      expect(extractMentionAtCursor('Hello world', 11)).toBeNull();
    });

    it('returns the handle being typed at cursor', () => {
      expect(extractMentionAtCursor('Hello @ali', 10)).toBe('ali');
    });

    it('returns null when @ is not preceded by whitespace or start', () => {
      expect(extractMentionAtCursor('email@user', 10)).toBeNull();
    });

    it('returns null when handle contains spaces', () => {
      expect(extractMentionAtCursor('Hello @ali ce', 13)).toBeNull();
    });

    it('returns empty handle when only @ is typed', () => {
      // @ at end with nothing after — handleText is empty
      expect(extractMentionAtCursor('Hello @', 7)).toBeNull();
    });

    it('returns the handle for @all being typed', () => {
      expect(extractMentionAtCursor('Hey @al', 7)).toBe('al');
    });
  });

  describe('hasAllMention', () => {
    it('returns true when @all is mentioned', () => {
      expect(hasAllMention('Hey @all')).toBe(true);
    });

    it('returns false for regular mentions', () => {
      expect(hasAllMention('Hey @alice')).toBe(false);
    });

    it('returns false for plain text', () => {
      expect(hasAllMention('Hello world')).toBe(false);
    });
  });

  describe('getMentionedHandles', () => {
    it('returns handles excluding @all', () => {
      const handles = getMentionedHandles('Hey @all and @alice');
      expect(handles).toEqual(['alice']);
    });

    it('returns all non-all handles', () => {
      const handles = getMentionedHandles('@alice @bob @all');
      expect(handles).toEqual(['alice', 'bob']);
    });

    it('returns empty for plain text', () => {
      expect(getMentionedHandles('Hello world')).toEqual([]);
    });
  });
});
