import { commerceTotals, GIFT_WRAP_PAISE, MAX_ORDER_PAISE } from './commerce-rules';
import type { CartItem } from './shopping-state';

export function cartSubtotalPaise(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + (Math.round(item.variant.price * 100) + (item.giftWrap ? GIFT_WRAP_PAISE : 0)) * item.quantity, 0);
}

/** A recoverable stored bag can exceed the order limit; rendering must remain usable. */
export function estimateTotals(subtotalPaise: number) {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0 || subtotalPaise > MAX_ORDER_PAISE) return null;
  return commerceTotals(subtotalPaise);
}
