"use client";

import { useEffect } from "react";

const RELOAD_FLAG_KEY = "__tbg_chunk_reload_attempted__";
const RESET_DELAY_MS = 30_000;

function readMessage(reason: unknown) {
  if (reason instanceof Error) {
    return `${reason.name}: ${reason.message}`;
  }

  if (typeof reason === "string") {
    return reason;
  }

  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message ?? "");
  }

  return "";
}

function isChunkLoadLikeError(reason: unknown) {
  const message = readMessage(reason).toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes("chunkloaderror") ||
    message.includes("loading chunk") ||
    message.includes("failed to fetch dynamically imported module")
  );
}

function attemptHardReloadOnce() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG_KEY) === "1") {
      return;
    }

    sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
  } catch {
    // Ignore storage failures (private browsing / strict mode).
  }

  window.location.reload();
}

export function ChunkErrorRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isChunkLoadLikeError(event.error ?? event.message)) {
        attemptHardReloadOnce();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadLikeError(event.reason)) {
        attemptHardReloadOnce();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const resetTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_FLAG_KEY);
      } catch {
        // Ignore storage failures.
      }
    }, RESET_DELAY_MS);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.clearTimeout(resetTimer);
    };
  }, []);

  return null;
}
