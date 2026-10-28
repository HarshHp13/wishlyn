/** Current INR trading rules. Merchant approval of fees/tax remains a release gate. */
export const GIFT_WRAP_PAISE = 35_000;
export const SHIPPING_PAISE = 25_000;
export const FREE_SHIPPING_THRESHOLD_PAISE = 300_000;
export const TAX_RATE_PERCENT = 3;
export const MAX_ORDER_PAISE = 100_000_000;

export function commerceTotals(subtotalPaise: number) {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0 || subtotalPaise > MAX_ORDER_PAISE) {
    throw new Error('Invalid purchase subtotal.');
  }
  const shippingPaise = subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : SHIPPING_PAISE;
  // Preserve the store's existing whole-rupee tax rounding, with integer paise output.
  const taxPaise = Math.round(subtotalPaise * TAX_RATE_PERCENT / 10_000) * 100;
  return { subtotalPaise, shippingPaise, taxPaise, totalPaise: subtotalPaise + shippingPaise + taxPaise };
}

export function formatMoney(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}
