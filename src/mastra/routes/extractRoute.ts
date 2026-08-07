import { randomUUID } from "node:crypto";
import { registerApiRoute } from "@mastra/core/server";
import { waitUntil } from "@vercel/functions";
import { logger } from "../lib/logger";
import { requestStore } from "../lib/extractionRequestStore";
import { runExtraction } from "../lib/runExtraction";
import {
  ExtractDataRequestSchema,
  ExtractionRequest,
  RequestStatus,
} from "../types/schemas";

export const extractRoute = registerApiRoute("/api/extract", {
  method: "POST",
  handler: async (c) => {
    const requestId = randomUUID();

    try {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }

      const validationResult = ExtractDataRequestSchema.safeParse(body);
      if (!validationResult.success) {
        const errorMessage = validationResult.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return c.json(
          {
            success: false,
            error: errorMessage || "Invalid request data",
            message: "Request validation failed",
            requestId,
            timestamp: new Date().toISOString(),
          },
          400
        );
      }

      const { fileUrl, filename, userId, webhookUrl, options } =
        validationResult.data;

      const extractionRequest: ExtractionRequest = {
        requestId,
        status: RequestStatus.PENDING,
        fileUrl,
        filename,
        userId,
        webhookUrl,
        options: {
          confidenceThreshold: options?.confidenceThreshold || 0.7,
          maxRetries: options?.maxRetries || 3,
          includeRawData: options?.includeRawData || false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await requestStore.createRequest(extractionRequest);

      logger.info("Async extraction request created", {
        requestId,
        filename,
        userId,
        webhookUrl,
        fileUrl: fileUrl.substring(0, 100) + "...",
      });

      // waitUntil keeps the serverless invocation alive until the extraction
      // and webhook dispatch finish; locally it is a no-op and the promise
      // simply runs on the dev server.
      waitUntil(runExtraction(c.get("mastra"), extractionRequest));

      return c.json(
        {
          success: true,
          message: "Extraction request submitted successfully",
          requestId,
          status: RequestStatus.PENDING,
          timestamp: new Date().toISOString(),
        },
        202
      );
    } catch (error) {
      logger.error("Extraction error", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return c.json(
        {
          success: false,
          error: errorMessage,
          message: "Extraction request failed",
          requestId,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  },
});
