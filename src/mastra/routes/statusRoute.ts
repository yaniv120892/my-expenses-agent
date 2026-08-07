import { registerApiRoute } from "@mastra/core/server";
import { logger } from "../lib/logger";
import { requestStore } from "../lib/extractionRequestStore";

export const statusRoute = registerApiRoute("/api/status/:requestId", {
  method: "GET",
  handler: async (c) => {
    const requestId = c.req.param("requestId");

    try {
      if (!requestId) {
        return c.json(
          {
            success: false,
            error: "Request ID is required",
            message: "Request ID parameter is missing",
            requestId: "",
            timestamp: new Date().toISOString(),
          },
          400
        );
      }

      const status = await requestStore.getRequestStatus(requestId);

      if (!status) {
        return c.json(
          {
            success: false,
            error: "Request not found",
            message: `No request found with ID: ${requestId}`,
            requestId,
            timestamp: new Date().toISOString(),
          },
          404
        );
      }

      return c.json(status, 200);
    } catch (error) {
      logger.error("Failed to get request status", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
      return c.json(
        {
          success: false,
          error: "Internal server error",
          message: "Failed to retrieve request status",
          requestId,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  },
});
