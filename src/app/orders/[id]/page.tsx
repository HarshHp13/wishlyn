import OrdersView from '@/components/orders/OrdersView';
export const metadata = { title: 'Your order | Wishlyn', robots: { index: false, follow: false } };
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) { return <OrdersView id={(await params).id} />; }
