import type { ReactNode } from "react";
import { ProtectedShell } from "@/components/layout/protected-shell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  return <ProtectedShell>{children}</ProtectedShell>;
}
