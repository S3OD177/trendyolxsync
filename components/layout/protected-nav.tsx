"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Bell, LayoutDashboard, Settings, Truck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

// Cast generic routes to satisfy Next.js typed routes until regeneration
const navItems = [
  { href: "/dashboard" as Route, label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments" as Route, label: "Shipments", icon: Truck },
  { href: "/alerts" as Route, label: "Alerts", icon: Bell },
  { href: "/settings" as Route, label: "Settings", icon: Settings }
] satisfies ReadonlyArray<{ href: Route; label: string; icon: ComponentType<{ className?: string }> }>;

export function ProtectedNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </>
    )
  }

  return (
    <TooltipProvider>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>
              <Link
                href={item.href}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors md:h-8 md:w-8",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="sr-only">{item.label}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </TooltipProvider>
  );
}
