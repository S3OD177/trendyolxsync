"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { X } from "lucide-react";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

interface ToastContextValue {
  toast: (input: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((input: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { ...input, id }]);

    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto animate-slide-in-right rounded-xl border px-4 py-3 shadow-lg backdrop-blur-lg ${
              item.variant === "destructive"
                ? "border-red-500/30 bg-red-950/90 text-red-100"
                : "border-border/60 bg-card/95 text-foreground"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{item.title}</div>
                {item.description ? <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 h-0.5 w-full rounded-full bg-border/30 overflow-hidden">
              <div
                className={`h-full rounded-full ${item.variant === "destructive" ? "bg-red-400/50" : "bg-primary/40"}`}
                style={{ animation: "progress-shrink 4s linear forwards" }}
              />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToasterProvider");
  }

  return context;
}
