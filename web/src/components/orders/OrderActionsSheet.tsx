'use client';

/**
 * OrderActionsSheet — port of mobile OrderActionsSheet. "More actions"
 * overflow: a needs-attention line when the capability model flags it,
 * then the action rows, then the order number footer.
 */

import { Sheet } from '@/components/ui/Sheet';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { needsAction, type OrderRole } from './orderCapabilities';

export interface OrderActionItem {
  key: string;
  label: string;
  icon: AppIconName;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'destructive';
}

interface Props {
  open: boolean;
  orderStatus: string;
  role: OrderRole;
  orderId: string;
  actions: OrderActionItem[];
  onClose: () => void;
}

export function OrderActionsSheet({ open, orderStatus, role, orderId, actions, onClose }: Props) {
  const hasAction = needsAction(orderStatus, role);

  return (
    <Sheet open={open} onClose={onClose} title="Order options" maxWidth={480}>
      <div className="px-5 pb-5">
        {hasAction ? (
          <p className="mb-1 flex items-center gap-2 py-1.5 text-caption font-medium text-commerce-trust">
            <Icon name="alert" size={16} />
            This order needs your attention
          </p>
        ) : null}

        <ul className="flex flex-col">
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                onClick={() => {
                  action.onPress();
                  onClose();
                }}
                className={`pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left ${
                  action.variant === 'destructive'
                    ? 'text-danger-text'
                    : action.variant === 'primary'
                      ? 'text-commerce-trust'
                      : 'text-text-primary'
                }`}
              >
                <Icon name={action.icon} size={20} />
                <span className="flex-1 text-body-emphasis font-medium">{action.label}</span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-4">
          <span className="text-caption text-text-muted">Order number</span>
          <span className="tnum text-caption text-text-secondary">
            {orderId.slice(0, 12).toUpperCase()}
          </span>
        </div>
      </div>
    </Sheet>
  );
}
