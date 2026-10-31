export interface ShippingAddress {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: 'India';
}

export interface PurchaseLineInput {
  variantId: string;
  quantity: number;
  giftWrap: boolean;
  giftMessage: string;
}

export interface PurchaseLine extends PurchaseLineInput {
  productId: string;
  title: string;
  metalType: string;
  purity: string;
  size: string | null;
  image: string | null;
  unitPricePaise: number;
  giftWrapPaise: number;
  lineTotalPaise: number;
}

export type PurchaseStatus = 'pending_payment' | 'paid' | 'cancelled' | 'expired' | 'review_required';
export type FulfillmentStatus = 'unfulfilled' | 'processing' | 'shipped' | 'delivered';

export interface Purchase {
  id: string;
  ownerId: string;
  email: string;
  items: PurchaseLine[];
  shipping: ShippingAddress;
  currency: 'INR';
  subtotalPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  status: PurchaseStatus;
  reservationState: 'active' | 'consumed' | 'released';
  paymentSetupState: 'idle' | 'creating' | 'bound' | 'uncertain';
  providerOrderId: string | null;
  providerPaymentId: string | null;
  fulfillmentStatus: FulfillmentStatus;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  events?: PurchaseEvent[];
}

export interface PurchaseEvent { id: string; type: string; message: string; createdAt: string }

export interface GatewayOrder { id: string; amount: number; currency: string; receipt: string }
export interface GatewayPayment { id: string; order_id: string; amount: number; currency: string; status: string; captured: boolean; amount_refunded: number }
export interface PaymentGateway {
  keyId: string;
  createOrder(order: Pick<Purchase, 'id' | 'totalPaise' | 'currency'>): Promise<GatewayOrder>;
  fetchPayment(id: string): Promise<GatewayPayment>;
  fetchOrderPayments(id: string): Promise<GatewayPayment[]>;
  findOrdersByReceipt(receipt: string): Promise<GatewayOrder[]>;
}
