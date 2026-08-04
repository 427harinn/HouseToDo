const MAX_ERROR_MESSAGE_LENGTH = 256;
const MAX_ERROR_STACK_LENGTH = 2048;

const redactSensitiveText = (value: string, maxLength: number): string =>
  value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(?:password|passwd|pwd|passphrase|secret|hash|salt|cookie|session(?:[_ -]?id)?|authorization|token)\b\s*(?:[:=]|is|was)?\s*[^\s,;}]+/gi, "[redacted-sensitive]")
    .replace(/(['"])[\s\S]*?\1/g, "$1[redacted]$1")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[redacted-secret]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-secret]")
    .slice(0, maxLength);

export const safeErrorName = (error: unknown): string =>
  error instanceof Error ? error.name : typeof error;

export const safeErrorMessage = (error: unknown): string =>
  redactSensitiveText(error instanceof Error ? error.message : String(error), MAX_ERROR_MESSAGE_LENGTH);

export const safeErrorStack = (error: unknown): string | undefined => {
  if (!(error instanceof Error) || !error.stack) return undefined;
  return redactSensitiveText(error.stack, MAX_ERROR_STACK_LENGTH);
};

export const logRegisterStage = (stage: string): void => {
  console.info("auth.register.stage", { stage });
};

export const logRegisterFailure = (error: unknown, stage: string): void => {
  const stack = safeErrorStack(error);
  console.error("auth.register.failed", {
    errorName: safeErrorName(error),
    errorMessage: safeErrorMessage(error),
    ...(stack ? { stack } : {}),
    stage
  });
};
