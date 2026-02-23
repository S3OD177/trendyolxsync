"use client";

import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function LockButton({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();

  const onLock = async () => {
    await fetch("/api/auth/pin", {
      method: "DELETE"
    });

    router.replace("/login");
    router.refresh();
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onLock}
      className={cn(
        "gap-2 text-muted-foreground hover:text-foreground w-full",
        collapsed ? "justify-center" : "justify-start"
      )}
    >
      <LockKeyhole className="h-4 w-4" />
      <span className={cn(collapsed && "sr-only")}>Lock Session</span>
    </Button>
  );
}
