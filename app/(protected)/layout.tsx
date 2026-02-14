import type { ReactNode } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { LockButton } from "@/components/auth/lock-button";
import { ProtectedNav } from "@/components/layout/protected-nav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen pb-10">
      <header className="border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-600 to-sky-700 text-white shadow-md shadow-cyan-700/20">
              <ChartNoAxesCombined className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Trendyol BuyBox Guard</h1>
              <p className="text-xs font-medium text-slate-500">SAR pricing monitor and safe manual updates</p>
            </div>
          </div>
          <div className="text-right text-sm text-slate-500">
            <div className="font-semibold text-slate-700">Web Monitor</div>
            <div className="mb-2 text-xs">Upstream Domain Security</div>
            <LockButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 md:grid-cols-[250px_1fr]">
        <aside className="surface-panel h-fit p-4">
          <ProtectedNav />
        </aside>

        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
