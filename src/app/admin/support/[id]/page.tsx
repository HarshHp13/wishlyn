import SupportWorkspace from "@/components/support/SupportWorkspace";
export default async function AdminSupportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SupportWorkspace admin id={(await params).id} />;
}
