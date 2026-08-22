import { sendSms } from './smsProvider.js';

const SMS_MAX_LENGTH = 160;

export type SmsTemplate =
  | 'ORDER_SHIPPED'
  | 'ORDER_DELIVERED'
  | 'ORDER_EXCEPTION'
  | 'SECURITY_CODE'
  | 'ACCOUNT_ALERT';

export interface OrderShippedParams {
  orderNumber: string;
  trackingNumber?: string;
  carrier?: string;
}

export interface OrderDeliveredParams {
  orderNumber: string;
}

export interface OrderExceptionParams {
  orderNumber: string;
  reason: string;
}

export interface SecurityCodeParams {
  code: string;
}

export interface AccountAlertParams {
  message: string;
}

export type SmsTemplateParams = {
  ORDER_SHIPPED: OrderShippedParams;
  ORDER_DELIVERED: OrderDeliveredParams;
  ORDER_EXCEPTION: OrderExceptionParams;
  SECURITY_CODE: SecurityCodeParams;
  ACCOUNT_ALERT: AccountAlertParams;
};

const ORDER_SHIPPED_TEMPLATE =
  'Your ThryftVerse order #{orderNumber} has shipped{trackingInfo}. Track at thryftverse.com/track';
const ORDER_DELIVERED_TEMPLATE =
  'Your ThryftVerse order #{orderNumber} has been delivered. Enjoy!';
const ORDER_EXCEPTION_TEMPLATE =
  'Alert: Issue with ThryftVerse order #{orderNumber}: {reason}. Check thryftverse.com/orders';
const SECURITY_CODE_TEMPLATE =
  'Your ThryftVerse security code is {code}. Never share this code.';
const ACCOUNT_ALERT_TEMPLATE = 'ThryftVerse: {message}';

function truncateForSms(body: string): string {
  if (body.length <= SMS_MAX_LENGTH) {
    return body;
  }
  return `${body.slice(0, SMS_MAX_LENGTH - 1)}\u2026`;
}

/**
 * Render an SMS template by filling in its placeholders.
 *
 * The rendered body is truncated to 160 characters (single SMS segment)
 * using an ellipsis if it would otherwise overflow.
 */
export function renderSmsTemplate<T extends SmsTemplate>(
  template: T,
  params: SmsTemplateParams[T],
): string {
  let body: string;
  switch (template) {
    case 'ORDER_SHIPPED': {
      const p = params as OrderShippedParams;
      let trackingInfo = '';
      if (p.trackingNumber) {
        const carrierPart = p.carrier ? `, ${p.carrier}` : '';
        trackingInfo = ` (tracking ${p.trackingNumber}${carrierPart})`;
      }
      body = ORDER_SHIPPED_TEMPLATE
        .replace('{orderNumber}', p.orderNumber)
        .replace('{trackingInfo}', trackingInfo);
      break;
    }
    case 'ORDER_DELIVERED': {
      const p = params as OrderDeliveredParams;
      body = ORDER_DELIVERED_TEMPLATE.replace('{orderNumber}', p.orderNumber);
      break;
    }
    case 'ORDER_EXCEPTION': {
      const p = params as OrderExceptionParams;
      body = ORDER_EXCEPTION_TEMPLATE
        .replace('{orderNumber}', p.orderNumber)
        .replace('{reason}', p.reason);
      break;
    }
    case 'SECURITY_CODE': {
      const p = params as SecurityCodeParams;
      body = SECURITY_CODE_TEMPLATE.replace('{code}', p.code);
      break;
    }
    case 'ACCOUNT_ALERT': {
      const p = params as AccountAlertParams;
      body = ACCOUNT_ALERT_TEMPLATE.replace('{message}', p.message);
      break;
    }
    default: {
      const exhaustive: never = template;
      throw new Error(`Unknown SMS template: ${exhaustive as string}`);
    }
  }
  return truncateForSms(body);
}

/**
 * Render an SMS template and send it via the configured SMS provider.
 *
 * Returns the underlying `SmsResult` from the provider. Callers that only
 * need fire-and-forget behaviour can ignore the returned promise or attach
 * `.catch(() => {})`.
 */
export async function sendTemplatedSms<T extends SmsTemplate>(
  to: string,
  template: T,
  params: SmsTemplateParams[T],
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const body = renderSmsTemplate(template, params);
  const result = await sendSms({ to, body });
  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  };
}
