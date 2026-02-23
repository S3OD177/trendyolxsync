"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChartNoAxesCombined, Menu, ChevronsLeft, ChevronsRight } from "lucide-react";
import { LockButton } from "@/components/auth/lock-button";
import { ProtectedNav } from "@/components/layout/protected-nav";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const SIDEBAR_STORAGE_KEY = "bbg_sidebar_collapsed";

export function ProtectedShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (raw === "true") {
        setCollapsed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-10 hidden flex-col border-r border-border/60 bg-card/50 backdrop-blur-xl sm:flex transition-[width] duration-200",
          collapsed ? "w-[72px]" : "w-[220px]"
        )}
      >
        <div className={cn("flex items-center gap-3 px-5 py-5", collapsed && "justify-center px-3")}> 
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <ChartNoAxesCombined className="h-4 w-4" />
          </div>
          <div className={cn("flex flex-col", collapsed && "hidden")}> 
            <span className="text-sm font-semibold text-foreground">BuyBox Guard</span>
            <span className="text-[11px] text-muted-foreground">Trendyol Monitor</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleCollapsed}
            className={cn("ml-auto h-8 w-8", collapsed && "ml-0")}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </Button>
        </div>
        <div className={cn("mx-4 h-px bg-border/60", collapsed && "mx-3")} />
        <nav className={cn("flex flex-col gap-1 px-3 py-4", collapsed && "px-2")}> 
          <ProtectedNav collapsed={collapsed} />
        </nav>
        <div className={cn("mt-auto border-t border-border/60 px-4 py-4", collapsed && "px-2")}> 
          <LockButton collapsed={collapsed} />
        </div>
      </aside>

      {/* Main Content */}
      <div className={cn("flex min-w-0 flex-1 flex-col", collapsed ? "sm:pl-[72px]" : "sm:pl-[220px]")}>
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
        <main className="flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 lg:p-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
