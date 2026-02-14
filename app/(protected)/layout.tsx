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
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r bg-background sm:flex">
        <nav className="flex flex-col items-center gap-4 px-2 sm:py-5">
          <div className="group flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:h-8 md:w-8 md:text-base">
            <ChartNoAxesCombined className="h-4 w-4 transition-all group-hover:scale-110" />
            <span className="sr-only">Trendyol BuyBox Guard</span>
          </div>
          <ProtectedNav />
        </nav>
      </aside>
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/60 px-4 backdrop-blur-xl sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="icon" variant="outline" className="sm:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs">
              <nav className="grid gap-6 text-lg font-medium">
                <div className="flex items-center gap-2 text-lg font-semibold md:text-base">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <ChartNoAxesCombined className="h-4 w-4" />
                  </div>
                  Trendyol Guard
                </div>
                <ProtectedNav mobile />
              </nav>
            </SheetContent>
          </Sheet>
          <div className="flex flex-1 items-center justify-between gap-4 md:justify-end">
            <div className="flex items-center gap-4">
              <div className="text-right text-xs text-muted-foreground hidden md:block">
                <div className="font-semibold text-foreground">Web Monitor Active</div>
                <div>Upstream Security</div>
              </div>
              <LockButton />
            </div>
          </div>
        </header>
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0 md:gap-8">
          {children}
        </main>
      </div>
    </div>
  );
}
