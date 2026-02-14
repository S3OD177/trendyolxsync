import { AlertsCenterClient } from "@/components/alerts/alerts-center-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AlertsPage() {
  return <AlertsCenterClient />;
}
