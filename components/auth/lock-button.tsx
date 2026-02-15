"use client";

import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LockButton() {
  const router = useRouter();

  const onLock = async () => {
    await fetch("/api/auth/pin", {
      method: "DELETE"
    });

    router.replace("/login");
    router.refresh();
  };

  return (
    <Button type="button" size="sm" variant="ghost" onClick={onLock} className="gap-2 text-muted-foreground hover:text-foreground w-full justify-start">
      <LockKeyhole className="h-4 w-4" />
      <span>Lock Session</span>
    </Button>
  );
}
