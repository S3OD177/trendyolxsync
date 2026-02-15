import type { ReactNode } from "react";
import { ChartNoAxesCombined, Menu } from "lucide-react";
import { LockButton } from "@/components/auth/lock-button";
import { ProtectedNav } from "@/components/layout/protected-nav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[220px] flex-col border-r border-border/60 bg-card/50 backdrop-blur-xl sm:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <ChartNoAxesCombined className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">BuyBox Guard</span>
            <span className="text-[11px] text-muted-foreground">Trendyol Monitor</span>
          </div>
        </div>
        <div className="mx-4 h-px bg-border/60" />
        <nav className="flex flex-col gap-1 px-3 py-4">
          <ProtectedNav />
        </nav>
        <div className="mt-auto border-t border-border/60 px-4 py-4">
          <LockButton />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col sm:pl-[220px]">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="sm:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0">
              <nav className="flex flex-col h-full">
                <div className="flex items-center gap-3 px-5 py-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
                    <ChartNoAxesCombined className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">BuyBox Guard</span>
                </div>
                <div className="mx-4 h-px bg-border/60" />
                <div className="flex flex-col gap-1 px-3 py-4">
                  <ProtectedNav mobile />
                </div>
                <div className="mt-auto border-t border-border/60 px-4 py-4">
                  <LockButton />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
          <div className="flex flex-1 items-center justify-between">
            <span className="text-sm font-semibold text-foreground">BuyBox Guard</span>
            <LockButton />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
