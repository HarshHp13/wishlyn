import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { dbGetVariantsByIds, dbGetProductsByIds, sql } from '@/lib/neon';

interface CartItemPayload {
  variantId: string;
  quantity: number;
  giftWrap: boolean;
}

export async function POST(request: Request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: 'Razorpay API credentials missing' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { items, amount } = body as { items?: CartItemPayload[]; amount?: number };

    let amountInPaise = amount;

    if (amountInPaise === undefined && items && Array.isArray(items) && items.length > 0) {
      let serverTotal = 0;

      if (sql) {
        const variantIds = items.map(i => i.variantId);
        const variants = await dbGetVariantsByIds(variantIds);

        if (!variants) {
          return NextResponse.json({ error: 'Failed to verify cart items' }, { status: 500 });
        }

        const productIds = [...new Set(variants.map(v => v.product_id))];
        const products = await dbGetProductsByIds(productIds);

        for (const item of items) {
          const variant = variants.find(v => v.id === item.variantId);
          const product = products?.find(p => p.id === variant?.product_id);
          if (!variant || !product) continue;
          const unitPrice = Number(variant.price);
          const giftWrapPrice = item.giftWrap ? 350 : 0;
          serverTotal += (unitPrice + giftWrapPrice) * item.quantity;
        }
      }

      const shippingCost = serverTotal >= 3000 ? 0 : 250;
      const tax = Math.round(serverTotal * 0.03);
      const finalTotalInr = serverTotal + shippingCost + tax;
      amountInPaise = Math.round(finalTotalInr * 100);
    }

    if (!amountInPaise || amountInPaise < 100) {
      return NextResponse.json(
        { error: 'Amount must be at least 100 paise' },
        { status: 400 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(amountInPaise),
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    });

    return NextResponse.json({
      order_id: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Razorpay Order Error]:', message);
    return NextResponse.json(
      { error: `Failed to create payment order: ${message}` },
      { status: 500 }
    );
  }
}
