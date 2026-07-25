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
    // C-4: Accept cart items instead of a raw amount — server computes the price
    const { items } = await request.json() as { items: CartItemPayload[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart items are required' }, { status: 400 });
    }

    // C-4: Server-side price verification — look up actual prices from DB
    let serverTotal = 0;

    if (sql) {
      const variantIds = items.map(i => i.variantId);
      const variants = await dbGetVariantsByIds(variantIds);

      if (!variants) {
        console.error('[Razorpay] Failed to fetch variants from Neon');
        return NextResponse.json({ error: 'Failed to verify cart items' }, { status: 500 });
      }

      // M-4: Validate stock availability
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
        const unitPrice = Number(product.base_price) + Number(variant.price_adjustment);
        const giftWrapPrice = item.giftWrap ? 5 : 0;
        serverTotal += (unitPrice + giftWrapPrice) * item.quantity;
      }
    } else {
      // Fallback: if no SQL, use a mock total (dev only)
      return NextResponse.json({
        mock: true,
        orderId: `MOCK-ORDER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        amount: 0,
        currency: 'INR',
      });
    }

    // Apply shipping and tax server-side
    const shippingCost = serverTotal >= 150 ? 0 : 9.99;
    const tax = serverTotal * 0.08;
    const totalUsd = serverTotal + shippingCost + tax;

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (
      !keyId ||
      !keySecret ||
      keyId === 'rzp_test_placeholder' ||
      keySecret === 'placeholder_secret'
    ) {
      console.warn('[Razorpay API] Using mock transaction — credentials not configured');
      return NextResponse.json({
        mock: true,
        orderId: `MOCK-ORDER-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        amount: totalUsd,
        currency: 'INR',
        serverTotal: totalUsd,
      });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // H-7: Read exchange rate from env (configurable)
    const usdToInrRate = parseFloat(process.env.USD_TO_INR_RATE || '83');
    const amountInPaise = Math.round(totalUsd * usdToInrRate * 100);

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
      serverTotal: totalUsd,
    });
  } catch (error: unknown) {
    // L-5 + H-8: Use unknown type and generic error
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Razorpay Order Error]:', message);
    return NextResponse.json(
      { error: 'Failed to create payment order. Please try again.' },
      { status: 500 }
    );
  }
}
