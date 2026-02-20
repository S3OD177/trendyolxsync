"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Bell, LayoutDashboard, Settings, Truck, FlaskConical, ShoppingBag, CornerUpLeft, Boxes } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/dashboard" as Route, label: "Dashboard", icon: LayoutDashboard },
  { href: "/products" as Route, label: "Products", icon: Boxes },
  { href: "/orders" as Route, label: "Orders", icon: ShoppingBag },
  { href: "/returns" as Route, label: "Returns", icon: CornerUpLeft },
  { href: "/shipments" as Route, label: "Shipments", icon: Truck },
  { href: "/alerts" as Route, label: "Alerts", icon: Bell },
  { href: "/settings" as Route, label: "Settings", icon: Settings },
  { href: "/api-test" as Route, label: "API Test", icon: FlaskConical }
] satisfies ReadonlyArray<{ href: Route; label: string; icon: ComponentType<{ className?: string }> }>;

export function ProtectedNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className={cn("h-[18px] w-[18px]", isActive && "text-primary")} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
