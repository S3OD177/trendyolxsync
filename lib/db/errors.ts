const normalizeMessage = (error: unknown) =>
  error instanceof Error ? error.message.toLowerCase() : "";

export function isDatabaseUnavailableError(error: unknown) {
  const message = normalizeMessage(error);
  return (
    message.includes("can't reach database server") ||
    message.includes("connection refused") ||
    message.includes("connection timed out") ||
    message.includes("timed out") ||
    message.includes("p1001")
  );
}

export function isMissingSchemaError(error: unknown) {
  const message = normalizeMessage(error);
  return message.includes("does not exist");
}

export function formatApiError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (isMissingSchemaError(error)) {
    return `${error.message}. Run Prisma migrations on production database.`;
  }

  return error.message;
}

