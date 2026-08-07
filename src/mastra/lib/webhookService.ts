import { logger } from "./logger";
import { WebhookPayload } from "../types/schemas";

const WEBHOOK_TIMEOUT_MS = 10000;

// Posts to the webhook URL exactly as received — the query string carries the
// caller's authentication parameters and must not be stripped or rewritten.
async function postWebhook(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<void> {
  logger.info("Sending webhook", {
    webhookUrl,
    requestId: payload.requestId,
    status: payload.status,
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "excel-extraction-service/1.0.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Webhook returned non-success status: ${response.status}`);
  }

  logger.info("Webhook sent successfully", {
    webhookUrl,
    requestId: payload.requestId,
    status: response.status,
  });
}

export async function sendWebhookWithRetry(
  webhookUrl: string,
  payload: WebhookPayload,
  maxRetries: number = 3
): Promise<boolean> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await postWebhook(webhookUrl, payload);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown error");
      logger.warn(`Webhook attempt ${attempt} failed`, {
        webhookUrl,
        requestId: payload.requestId,
        attempt,
        error: lastError.message,
      });

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error("All webhook attempts failed", {
    webhookUrl,
    requestId: payload.requestId,
    maxRetries,
    lastError: lastError?.message,
  });
  return false;
}
