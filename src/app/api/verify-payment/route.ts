import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { dbGetVariantsByIds, dbGetProductsByIds, dbInsertOrder, dbDecrementVariantStock, sql } from '@/lib/neon';

interface VerifyPayload {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  order_id?: string;
  payment_id?: string;
  signature?: string;
  orderId?: string;
  shipping?: Record<string, any>;
  items?: Array<{
    variantId: string;
    quantity: number;
    giftWrap: boolean;
    giftMessage?: string;
  }>;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as VerifyPayload;
    const razorpay_order_id = body.razorpay_order_id || body.order_id;
    const razorpay_payment_id = body.razorpay_payment_id || body.payment_id;
    const razorpay_signature = body.razorpay_signature || body.signature;
    const { orderId, shipping, items } = body;

    // Validate missing fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing payment verification data: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required' 
        },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay secret key configuration missing' },
        { status: 500 }
      );
    }

    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // Compare generated signature with razorpay_signature
    if (expectedSignature !== razorpay_signature) {
      console.error('[Razorpay Verify] Signature mismatch — potential fraud attempt');
      return NextResponse.json(
        { success: false, error: 'Invalid payment signature. Verification failed.', verified: false },
        { status: 400 }
      );
    }

    // If order database details provided, save order and update stock
    if (sql && items && shipping && orderId) {
      try {
        const variantIds = items.map(i => i.variantId);
        const variants = await dbGetVariantsByIds(variantIds);
        const productIds = [...new Set((variants || []).map(v => v.product_id))];
        const products = await dbGetProductsByIds(productIds);

        const orderItems = items.map(item => {
          const variant = variants?.find(v => v.id === item.variantId);
          const product = products?.find(p => p.id === variant?.product_id);
          const unitPrice = Number(variant?.price || 0);
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

        const subtotal = orderItems.reduce((acc, item) => {
          const giftWrapPrice = items.find(i => i.variantId === item.variantId)?.giftWrap ? 350 : 0;
          return acc + (item.price + giftWrapPrice) * item.quantity;
        }, 0);
        const shippingCost = subtotal >= 3000 ? 0 : 250;
        const tax = Math.round(subtotal * 0.03);
        const total = subtotal + shippingCost + tax;

        await dbInsertOrder({
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

        for (const item of items) {
          await dbDecrementVariantStock(item.variantId, item.quantity);
        }
      } catch (dbErr) {
        console.error('[Razorpay Verify] DB save error:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      verified: true,
      razorpay_order_id,
      razorpay_payment_id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Razorpay Verify Error]:', message);
    return NextResponse.json(
      { success: false, error: `Payment verification error: ${message}` },
      { status: 500 }
    );
  }
}
