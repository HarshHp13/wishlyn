import type { PurchaseLineInput, ShippingAddress } from './types';

export class CheckoutValidationError extends Error {
  constructor(public fields: Record<string, string>) { super('Check the highlighted details.'); }
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export const INDIAN_STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'] as const;

export function validateShipping(input: unknown): ShippingAddress {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const errors: Record<string, string> = {};
  for (const [key, min, max] of [['firstName', 1, 80], ['lastName', 1, 80], ['address', 8, 300], ['city', 2, 80]] as const) {
    const s = text(value[key]);
    if (s.length < min || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) errors[key] = `Enter ${key === 'address' ? 'a complete street address' : key === 'city' ? 'a city' : 'a name'} (${min}–${max} characters).`;
  }
  let phone = text(value.phone).replace(/[\s()-]/g, '');
  if (phone.startsWith('+91')) phone = phone.slice(3);
  else if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (!/^[1-9]\d{5}$/.test(text(value.zipCode))) errors.zipCode = 'Enter a valid 6-digit Indian PIN code.';
  const state = INDIAN_STATES.find(state => state.toLowerCase() === text(value.state).toLowerCase());
  if (!state) errors.state = 'Choose a supported Indian state or union territory.';
  if (value.country !== 'India') errors.country = 'Checkout currently supports India only.';
  if (Object.keys(errors).length) throw new CheckoutValidationError(errors);
  return { firstName: text(value.firstName), lastName: text(value.lastName), phone: `+91${phone}`, address: text(value.address), city: text(value.city), state: state!, zipCode: text(value.zipCode), country: 'India' };
}

export function validatePurchaseLines(input: unknown): PurchaseLineInput[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 40) throw new CheckoutValidationError({ items: 'A bag must contain between 1 and 40 lines.' });
  const combined = new Map<string, PurchaseLineInput>();
  let total = 0;
  for (const candidate of input) {
    const line = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
    const variantId = text(line.variantId);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(variantId) || !Number.isSafeInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 99 || typeof line.giftWrap !== 'boolean') {
      throw new CheckoutValidationError({ items: 'Every bag line needs a valid variant, quantity from 1 to 99 and gift option.' });
    }
    if (line.giftMessage !== undefined && typeof line.giftMessage !== 'string') throw new CheckoutValidationError({ items: 'Gift instructions must be text.' });
    const giftMessage = text(line.giftMessage);
    if (giftMessage.length > 150 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(giftMessage) || (!line.giftWrap && giftMessage)) throw new CheckoutValidationError({ items: 'Gift messages require gift wrapping and must be 150 characters or fewer.' });
    const key = JSON.stringify([variantId, line.giftWrap, giftMessage]);
    const prior = combined.get(key);
    const quantity = (prior?.quantity || 0) + Number(line.quantity);
    if (quantity > 99) throw new CheckoutValidationError({ items: 'A gift configuration cannot exceed 99 pieces.' });
    combined.set(key, { variantId, quantity, giftWrap: line.giftWrap, giftMessage });
    total += Number(line.quantity);
  }
  if (total > 250) throw new CheckoutValidationError({ items: 'A bag cannot exceed 250 pieces.' });
  return [...combined.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function validateIdempotencyKey(input: unknown): string {
  if (typeof input !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(input)) throw new CheckoutValidationError({ requestKey: 'A valid checkout request key is required. Please retry from your bag.' });
  return input;
}

export function validateOrderId(value: unknown): string {
  if (typeof value !== 'string' || !/^WISH-[A-F0-9]{32}$/.test(value)) throw new CheckoutValidationError({ orderId: 'Invalid order reference.' });
  return value;
}
