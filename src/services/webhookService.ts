import axios from "axios";
import { logger } from "../utils/logger";
import { WebhookPayload } from "../types/schemas";

export class WebhookService {
  async sendWebhook(
    webhookUrl: string,
    payload: WebhookPayload
  ): Promise<boolean> {
    try {
      logger.info("Sending webhook", {
        webhookUrl,
        requestId: payload.requestId,
        status: payload.status,
      });

      const response = await axios.post(webhookUrl, payload, {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "excel-extraction-service/1.0.0",
        },
      });

      if (response.status >= 200 && response.status < 300) {
        logger.info("Webhook sent successfully", {
          webhookUrl,
          requestId: payload.requestId,
          status: response.status,
        });
        return true;
      } else {
        logger.warn("Webhook returned non-success status", {
          webhookUrl,
          requestId: payload.requestId,
          status: response.status,
        });
        return false;
      }
    } catch (error) {
      logger.error("Failed to send webhook", {
        webhookUrl,
        requestId: payload.requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  async sendWebhookWithRetry(
    webhookUrl: string,
    payload: WebhookPayload,
    maxRetries: number = 3
  ): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const success = await this.sendWebhook(webhookUrl, payload);
        if (success) {
          return true;
        }
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
}
