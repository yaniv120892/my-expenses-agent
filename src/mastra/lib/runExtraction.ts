import type { Mastra } from "@mastra/core";
import { logger } from "./logger";
import { requestStore } from "./extractionRequestStore";
import { sendWebhookWithRetry } from "./webhookService";
import {
  ExtractionRequest,
  ExtractionResult,
  RequestStatus,
  WebhookPayload,
} from "../types/schemas";

const WEBHOOK_MAX_RETRIES = 3;

// A failed workflow run surfaces its error as an Error, a string, or a
// serialized error object — normalize all of them to the message string.
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export async function runExtraction(
  mastra: Mastra,
  request: ExtractionRequest
): Promise<void> {
  const { requestId } = request;

  try {
    await requestStore.updateRequestStatus(requestId, RequestStatus.PROCESSING);

    logger.info("Starting async extraction processing", {
      requestId,
      filename: request.filename,
      userId: request.userId,
    });

    const workflow = mastra.getWorkflow("excelExtractionWorkflow");
    const run = await workflow.createRun({ runId: requestId });
    const outcome = await run.start({
      inputData: {
        requestId,
        fileUrl: request.fileUrl,
        filename: request.filename,
        userId: request.userId,
        options: request.options!,
        startTime: Date.now(),
      },
    });

    if (outcome.status !== "success") {
      const error =
        outcome.status === "failed"
          ? outcome.error
          : `Workflow ended with status: ${outcome.status}`;
      throw new Error(extractErrorMessage(error));
    }

    const result = outcome.result as ExtractionResult;

    logger.info("Async extraction completed successfully", {
      requestId,
      transactionCount: result.transactions.length,
      processingTime: result.processingTime,
    });

    await requestStore.updateRequestStatus(requestId, RequestStatus.COMPLETED, {
      result,
    });

    await sendCompletionWebhook(request, result);
  } catch (error) {
    logger.error("Async extraction processing failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await requestStore.updateRequestStatus(requestId, RequestStatus.FAILED, {
      error: errorMessage,
    });

    await sendErrorWebhook(request, errorMessage);
  }
}

async function sendCompletionWebhook(
  request: ExtractionRequest,
  result: ExtractionResult
): Promise<void> {
  const payload: WebhookPayload = {
    requestId: request.requestId,
    status: RequestStatus.COMPLETED,
    result,
    completedAt: new Date().toISOString(),
  };

  const success = await sendWebhookWithRetry(
    request.webhookUrl,
    payload,
    WEBHOOK_MAX_RETRIES
  );

  if (!success) {
    logger.error("Failed to send completion webhook after retries", {
      requestId: request.requestId,
      webhookUrl: request.webhookUrl,
    });
  }
}

async function sendErrorWebhook(
  request: ExtractionRequest,
  error: string
): Promise<void> {
  const payload: WebhookPayload = {
    requestId: request.requestId,
    status: RequestStatus.FAILED,
    error,
    completedAt: new Date().toISOString(),
  };

  const success = await sendWebhookWithRetry(
    request.webhookUrl,
    payload,
    WEBHOOK_MAX_RETRIES
  );

  if (!success) {
    logger.error("Failed to send error webhook after retries", {
      requestId: request.requestId,
      webhookUrl: request.webhookUrl,
    });
  }
}
