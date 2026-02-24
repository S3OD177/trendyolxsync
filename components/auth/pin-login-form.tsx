"use client";

import { FormEvent, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ChartNoAxesCombined, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PinLoginForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeNext = nextPath.startsWith("/") ? nextPath : "/dashboard";

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!/^\d{4}$/.test(pin)) {
      setError("Enter a valid 4-digit PIN.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Authentication failed");
      }

      router.replace(safeNext as Route);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm animate-slide-up">
        {/* Brand Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <ChartNoAxesCombined className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">BuyBox Guard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter your PIN to continue</p>
          </div>
        </div>

        <Card className="border-white/10">
          <CardContent className="p-6">
            <form className="space-y-4" onSubmit={onSubmit}>
              <Input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                pattern="[0-9]*"
                type="password"
                placeholder="****"
                autoFocus
                className="h-14 text-center text-2xl tracking-[0.5em] font-mono"
              />
              {error ? (
                <p className="text-sm text-red-400 text-center">{error}</p>
              ) : null}
              <Button type="submit" disabled={loading} className="w-full h-11">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Unlock"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
