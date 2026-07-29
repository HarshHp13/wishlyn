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
    const { items } = await request.json() as { items: CartItemPayload[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart items are required' }, { status: 400 });
    }

    // Server-side price verification — look up actual prices from DB
    let serverTotal = 0;

    if (sql) {
      const variantIds = items.map(i => i.variantId);
      const variants = await dbGetVariantsByIds(variantIds);

      if (!variants) {
        console.error('[Razorpay] Failed to fetch variants from Neon');
        return NextResponse.json({ error: 'Failed to verify cart items' }, { status: 500 });
      }

      // Validate stock availability
      for (const item of items) {
        const variant = variants.find(v => v.id === item.variantId);
        if (!variant) {
          return NextResponse.json({ error: `Variant ${item.variantId} not found` }, { status: 400 });
        }
        if (Number(variant.stock) < item.quantity) {
          return NextResponse.json(
            { error: `Insufficient stock for variant ${item.variantId}. Available: ${variant.stock}` },
            { status: 400 }
          );
        }
      }

      // Fetch product base prices
      const productIds = [...new Set(variants.map(v => v.product_id))];
      const products = await dbGetProductsByIds(productIds);

      if (!products) {
        console.error('[Razorpay] Failed to fetch products from Neon');
        return NextResponse.json({ error: 'Failed to verify product prices' }, { status: 500 });
      }

      for (const item of items) {
        const variant = variants.find(v => v.id === item.variantId)!;
        const product = products.find(p => p.id === variant.product_id);
        if (!product) {
          return NextResponse.json({ error: `Product for variant ${item.variantId} not found` }, { status: 400 });
        }
        const unitPrice = Number(variant.price);
        const giftWrapPrice = item.giftWrap ? 350 : 0;
        serverTotal += (unitPrice + giftWrapPrice) * item.quantity;
      }
    } else {
      return NextResponse.json({
        mock: true,
        orderId: `MOCK-ORDER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        amount: 0,
        currency: 'INR',
      });
    }

    // Apply shipping and 3% GST tax server-side in INR
    const shippingCost = serverTotal >= 3000 ? 0 : 250;
    const tax = Math.round(serverTotal * 0.03);
    const finalTotalInr = serverTotal + shippingCost + tax;

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (
      !keyId ||
      !keySecret ||
      keyId === 'rzp_test_placeholder' ||
      keySecret === 'placeholder_secret'
    ) {
      console.warn('[Razorpay API] Using mock transaction — credentials missing');
      return NextResponse.json({
        mock: true,
        orderId: `MOCK-ORDER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        amount: Math.round(finalTotalInr * 100),
        currency: 'INR',
        serverTotal: finalTotalInr,
      });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Amount in paise for Razorpay INR transaction
    const amountInPaise = Math.round(finalTotalInr * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    return NextResponse.json({
      mock: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      serverTotal: finalTotalInr,
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
