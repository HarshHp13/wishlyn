import OrdersView from '@/components/orders/OrdersView';
export const metadata = { title: 'Order workspace | Wishlyn', robots: { index: false, follow: false } };
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) { return <OrdersView admin id={(await params).id} />; }
