import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbGetVariantsByIds, dbGetProductsByIds, dbInsertOrder, dbDecrementVariantStock, sql } from '@/lib/neon';

interface VerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  orderId: string;
  shipping: Record<string, string>;
  items: Array<{
    variantId: string;
    quantity: number;
    giftWrap: boolean;
    giftMessage?: string;
  }>;
  serverTotal: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as VerifyPayload;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
      shipping,
      items,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification data' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return NextResponse.json({ error: 'Payment configuration error' }, { status: 500 });
    }

    // C-5: Verify Razorpay signature using HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('[Razorpay Verify] Signature mismatch — potential fraud attempt');
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    // F-1: Create order server-side after verification
    if (sql) {
      // Re-fetch current prices for the order record
      const variantIds = items.map(i => i.variantId);
      const variants = await dbGetVariantsByIds(variantIds);
      const productIds = [...new Set((variants || []).map(v => v.product_id))];
      const products = await dbGetProductsByIds(productIds);

      const orderItems = items.map(item => {
        const variant = variants?.find(v => v.id === item.variantId);
        const product = products?.find(p => p.id === variant?.product_id);
        const unitPrice = Number(product?.base_price || 0) + Number(variant?.price_adjustment || 0);
        return {
          productId: product?.id,
          productTitle: product?.title,
          variantId: item.variantId,
          metalType: variant?.metal_type,
          size: variant?.size,
          quantity: item.quantity,
          price: unitPrice,
          giftWrap: item.giftWrap,
          giftMessage: item.giftMessage || null,
        };
      });

      // Compute server-side totals in INR
      const subtotal = orderItems.reduce((acc, item) => {
        const giftWrapPrice = items.find(i => i.variantId === item.variantId)?.giftWrap ? 350 : 0;
        return acc + (item.price + giftWrapPrice) * item.quantity;
      }, 0);
      const shippingCost = subtotal >= 3000 ? 0 : 250;
      const tax = Math.round(subtotal * 0.03);
      const total = subtotal + shippingCost + tax;

      // Insert order with verified payment data
      const inserted = await dbInsertOrder({
        id: orderId,
        user_email: shipping.email,
        shipping_address: shipping,
        items: orderItems,
        subtotal,
        shipping_cost: shippingCost,
        tax,
        total,
        status: 'confirmed',
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      });

      if (!inserted) {
        console.error('[Razorpay Verify] Failed to save order into Neon DB');
        return NextResponse.json({ error: 'Failed to save order' }, { status: 500 });
      }

      // M-4: Decrement stock atomically
      for (const item of items) {
        await dbDecrementVariantStock(item.variantId, item.quantity);
      }
    }

    return NextResponse.json({
      verified: true,
      orderId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Razorpay Verify Error]:', message);
    return NextResponse.json(
      { error: 'Payment verification failed. Please contact support.' },
      { status: 500 }
    );
  }
}
