import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { dbGetVariantsByIds, dbGetProductsByIds, sql } from '@/lib/neon';

interface CreateOrderPayload {
  amount?: number; // in paise
  currency?: string;
  receipt?: string;
  items?: Array<{
    variantId: string;
    quantity: number;
    giftWrap: boolean;
  }>;
}

export async function POST(request: Request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: 'Razorpay API keys are missing' },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as CreateOrderPayload;

    let amountInPaise: number | undefined = undefined;

    if (typeof body.amount === 'number') {
      amountInPaise = body.amount;
    } else if (body.items && Array.isArray(body.items) && body.items.length > 0) {
      let serverTotal = 0;
      if (sql) {
        const variantIds = body.items.map(i => i.variantId);
        const variants = await dbGetVariantsByIds(variantIds);

        if (!variants) {
          return NextResponse.json({ error: 'Failed to verify cart items' }, { status: 500 });
        }

        const productIds = [...new Set(variants.map(v => v.product_id))];
        const products = await dbGetProductsByIds(productIds);

        for (const item of body.items) {
          const variant = variants.find(v => v.id === item.variantId);
          if (!variant) continue;
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

    if (amountInPaise === undefined) {
      return NextResponse.json(
        { error: 'Amount or items are required' },
        { status: 400 }
      );
    }

    // Minimum amount validation: 100 paise
    if (amountInPaise < 100) {
      return NextResponse.json(
        { error: 'Amount must be at least 100 paise' },
        { status: 400 }
      );
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const currency = body.currency || 'INR';
    const receipt = body.receipt || `receipt_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount: Math.round(amountInPaise),
      currency,
      receipt,
      payment_capture: 1,
    } as any);

    return NextResponse.json({
      key: keyId,
      order_id: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (error: any) {
    const statusCode = error?.statusCode || error?.status;
    const message = error?.error?.description || error?.message || 'Unknown error';
    console.error('[Razorpay Create Order Error]:', error);

    if (
      statusCode === 401 ||
      message.toLowerCase().includes('auth') ||
      message.toLowerCase().includes('unauthorized') ||
      message.toLowerCase().includes('key')
    ) {
      return NextResponse.json(
        { error: `Authentication failed: ${message}` },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Failed to create Razorpay order: ${message}` },
      { status: 500 }
    );
  }
}
