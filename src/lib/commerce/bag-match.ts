interface Configuration {
  variantId: string;
  quantity: number;
  giftWrap: boolean;
  giftMessage?: string;
}

function quantities(lines: readonly Configuration[]): Map<string, number> | null {
  if (!lines.length) return null;
  const result = new Map<string, number>();
  for (const line of lines) {
    if (typeof line.variantId !== 'string' || !line.variantId || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || typeof line.giftWrap !== 'boolean') return null;
    if (line.giftMessage !== undefined && typeof line.giftMessage !== 'string') return null;
    const message = line.giftMessage?.trim() || '';
    if (!line.giftWrap && message) return null;
    const key = JSON.stringify([line.variantId, line.giftWrap, message]);
    const quantity = (result.get(key) || 0) + line.quantity;
    if (!Number.isSafeInteger(quantity)) return null;
    result.set(key, quantity);
  }
  return result;
}

/** A saved quote may be paid after the bag changes. Never clear pieces that were not purchased. */
export function bagMatchesPurchase(bag: readonly Configuration[], purchased: readonly Configuration[]): boolean {
  const current = quantities(bag), paid = quantities(purchased);
  return Boolean(current && paid && current.size === paid.size && [...current].every(([key, quantity]) => paid.get(key) === quantity));
}
