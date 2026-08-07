import { logger } from "./logger";

export interface RetryOptions {
  attempts: number;
  timeoutMs: number;
  label: string;
}

export function getAiTimeoutMs(): number {
  return parseInt(process.env.AI_TIMEOUT || "60000", 10);
}

// Runs fn with a per-attempt abort timeout and exponential backoff between
// attempts. This is how the per-request `options.maxRetries` and the
// AI_TIMEOUT env var are honored for AI calls (Mastra step `retries` is
// static at definition time, so it cannot carry a per-request value).
export async function withRetries<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  { attempts, timeoutMs, label }: RetryOptions
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(AbortSignal.timeout(timeoutMs));
    } catch (error) {
      lastError = error;
      logger.warn(`${label} attempt ${attempt}/${attempts} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < attempts) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${attempts} attempts`);
}
