import SupportWorkspace from "@/components/support/SupportWorkspace";
export default async function SupportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SupportWorkspace id={(await params).id} />;
}
