import OrdersView from '@/components/orders/OrdersView';
export const metadata = { title: 'Store orders | Wishlyn', robots: { index: false, follow: false } };
export default function AdminOrdersPage() { return <OrdersView admin />; }
