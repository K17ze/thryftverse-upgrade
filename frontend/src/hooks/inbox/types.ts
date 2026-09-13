import type { MessagingSegment } from '../../components/chat/MessagingSegmentRail';

export type InboxSegment =
  | MessagingSegment
  | 'all'
  | 'unread'
  | 'buying'
  | 'selling'
  | 'archived'
  | 'groups';
