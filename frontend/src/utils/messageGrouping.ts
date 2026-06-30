export const SYSTEM_MESSAGE_TYPES = ['purchase_status', 'offer', 'offer_declined'];
export const TIME_GAP_MS = 5 * 60 * 1000;

export interface GroupableMessage {
  sender: string;
  type: string;
  date?: string;
}

export function isSystemMessage(msg: GroupableMessage): boolean {
  return SYSTEM_MESSAGE_TYPES.includes(msg.type);
}

export function isFirstInCluster(
  msg: GroupableMessage,
  prevMsg: GroupableMessage | undefined
): boolean {
  if (!prevMsg) return true;
  if (prevMsg.sender !== msg.sender) return true;
  if (isSystemMessage(prevMsg) || isSystemMessage(msg)) return true;
  if (prevMsg.type !== msg.type) return true;

  const prevTimeGap =
    prevMsg.date && msg.date
      ? Math.abs(new Date(msg.date).getTime() - new Date(prevMsg.date).getTime())
      : 0;

  return prevTimeGap > TIME_GAP_MS;
}

export function isLastInCluster(
  msg: GroupableMessage,
  nextMsg: GroupableMessage | undefined
): boolean {
  if (!nextMsg) return true;
  if (nextMsg.sender !== msg.sender) return true;
  if (isSystemMessage(nextMsg) || isSystemMessage(msg)) return true;
  if (nextMsg.type !== msg.type) return true;

  const nextTimeGap =
    nextMsg.date && msg.date
      ? Math.abs(new Date(nextMsg.date).getTime() - new Date(msg.date).getTime())
      : 0;

  return nextTimeGap > TIME_GAP_MS;
}

export function isDayChanged(prevDate: string, currDate: string): boolean {
  return prevDate.slice(0, 10) !== currDate.slice(0, 10);
}
