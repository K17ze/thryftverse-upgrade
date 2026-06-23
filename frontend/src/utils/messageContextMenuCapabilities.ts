export type MessageAction = 'copy' | 'reply' | 'react' | 'delete' | 'retry' | 'report';

export interface ActionDef {
  id: MessageAction;
  label: string;
  icon: string;
  color?: string;
  destructive?: boolean;
}

export interface MessageContextCapabilities {
  isOwnMessage: boolean;
  isFailed: boolean;
  messageText?: string;
}

export function deriveMessageActions(caps: MessageContextCapabilities): ActionDef[] {
  const list: ActionDef[] = [];

  if (caps.isOwnMessage && caps.isFailed) {
    list.push({ id: 'retry', label: 'Retry', icon: 'refresh-outline' });
  }

  list.push({ id: 'reply', label: 'Reply', icon: 'arrow-undo-outline' });
  list.push({ id: 'react', label: 'React', icon: 'happy-outline' });

  if (caps.messageText && caps.messageText.trim().length > 0) {
    list.push({ id: 'copy', label: 'Copy text', icon: 'copy-outline' });
  }

  if (!caps.isOwnMessage) {
    list.push({ id: 'report', label: 'Report', icon: 'flag-outline', color: 'danger' });
  }

  if (caps.isOwnMessage) {
    list.push({
      id: 'delete',
      label: 'Delete message',
      icon: 'trash-outline',
      color: 'danger',
      destructive: true,
    });
  }

  return list;
}

export function hasAction(actions: ActionDef[], actionId: MessageAction): boolean {
  return actions.some((a) => a.id === actionId);
}
