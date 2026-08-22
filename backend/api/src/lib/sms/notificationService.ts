import { sendTemplatedSms, type SmsTemplate, type SmsTemplateParams } from './templates.js';

export interface SmsNotificationResult {
  success: boolean;
  error?: string;
}

const E164_PATTERN = /^\+\d{8,15}$/;

/**
 * Basic E.164 phone-number validation.
 *
 * Accepts numbers that start with `+` followed by 8 to 15 digits (the
 * E.164 subscriber-number range). Returns `false` for anything else so
 * callers can skip sending to malformed or missing numbers.
 */
export function isValidE164PhoneNumber(phoneNumber: string): boolean {
  return E164_PATTERN.test(phoneNumber);
}

function logNotificationAttempt(input: {
  channel: 'sms';
  template: string;
  to: string;
  orderId?: string;
  success: boolean;
  error?: string;
}): void {
  const payload: Record<string, unknown> = {
    channel: input.channel,
    template: input.template,
    to: input.to,
    success: input.success,
  };
  if (input.orderId) {
    payload.orderId = input.orderId;
  }
  if (input.error) {
    payload.error = input.error;
  }
  console.log('[SMS notification] %j', payload);
}

async function dispatch<T extends SmsTemplate>(input: {
  to: string;
  template: T;
  params: SmsTemplateParams[T];
  orderId?: string;
}): Promise<SmsNotificationResult> {
  if (!input.to || !isValidE164PhoneNumber(input.to)) {
    logNotificationAttempt({
      channel: 'sms',
      template: input.template,
      to: input.to,
      orderId: input.orderId,
      success: false,
      error: 'Invalid phone number',
    });
    return { success: false, error: 'Invalid phone number' };
  }

  try {
    const result = await sendTemplatedSms(input.to, input.template, input.params);
    logNotificationAttempt({
      channel: 'sms',
      template: input.template,
      to: input.to,
      orderId: input.orderId,
      success: result.success,
      error: result.error,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMS error';
    logNotificationAttempt({
      channel: 'sms',
      template: input.template,
      to: input.to,
      orderId: input.orderId,
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Send an order-shipped SMS to the buyer.
 *
 * Fire-and-forget safe — never throws. Returns `{ success, error? }`.
 */
export async function notifyOrderShipped(
  orderId: string,
  phoneNumber: string,
  details: { orderNumber: string; trackingNumber?: string; carrier?: string },
): Promise<SmsNotificationResult> {
  return dispatch({
    to: phoneNumber,
    template: 'ORDER_SHIPPED',
    params: details,
    orderId,
  });
}

/**
 * Send an order-delivered SMS to the buyer.
 *
 * Fire-and-forget safe — never throws. Returns `{ success, error? }`.
 */
export async function notifyOrderDelivered(
  orderId: string,
  phoneNumber: string,
): Promise<SmsNotificationResult> {
  return dispatch({
    to: phoneNumber,
    template: 'ORDER_DELIVERED',
    params: { orderNumber: orderId },
    orderId,
  });
}

/**
 * Send an order-exception SMS to the buyer.
 *
 * Fire-and-forget safe — never throws. Returns `{ success, error? }`.
 */
export async function notifyOrderException(
  orderId: string,
  phoneNumber: string,
  reason: string,
): Promise<SmsNotificationResult> {
  return dispatch({
    to: phoneNumber,
    template: 'ORDER_EXCEPTION',
    params: { orderNumber: orderId, reason },
    orderId,
  });
}

/**
 * Send a security verification code SMS.
 *
 * Fire-and-forget safe — never throws. Returns `{ success, error? }`.
 */
export async function sendSecurityCode(
  phoneNumber: string,
  code: string,
): Promise<SmsNotificationResult> {
  return dispatch({
    to: phoneNumber,
    template: 'SECURITY_CODE',
    params: { code },
  });
}

/**
 * Send a generic account alert SMS.
 *
 * Fire-and-forget safe — never throws. Returns `{ success, error? }`.
 */
export async function sendAccountAlert(
  phoneNumber: string,
  message: string,
): Promise<SmsNotificationResult> {
  return dispatch({
    to: phoneNumber,
    template: 'ACCOUNT_ALERT',
    params: { message },
  });
}
