"use client";

import { useRouter } from "next/navigation";
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
    <Button type="button" size="sm" variant="outline" onClick={onLock}>
      Lock
    </Button>
  );
}
