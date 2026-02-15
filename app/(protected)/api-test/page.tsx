import { ApiTestClient } from "@/components/debug/api-test-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ApiTestPage() {
  return <ApiTestClient />;
}
