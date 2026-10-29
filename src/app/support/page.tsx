import SupportWorkspace from "@/components/support/SupportWorkspace";
import { servicePolicy } from "@/lib/account/policy";
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  return (
    <SupportWorkspace
      orderId={(await searchParams).order}
      policy={servicePolicy()}
    />
  );
}
