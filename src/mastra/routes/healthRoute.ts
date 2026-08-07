import { registerApiRoute } from "@mastra/core/server";
import { requestStore } from "../lib/extractionRequestStore";

export const healthRoute = registerApiRoute("/api/health", {
  method: "GET",
  handler: async (c) => {
    try {
      const redisHealthy = await requestStore.isHealthy();

      const response = {
        status: redisHealthy ? "healthy" : "degraded",
        service: "excel-extraction-service",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        dependencies: {
          redis: redisHealthy ? "healthy" : "unhealthy",
        },
      };

      return c.json(response, redisHealthy ? 200 : 503);
    } catch (error) {
      return c.json(
        {
          status: "unhealthy",
          service: "excel-extraction-service",
          timestamp: new Date().toISOString(),
          version: "1.0.0",
          dependencies: {
            redis: "unhealthy",
          },
          error: error instanceof Error ? error.message : "Unknown error",
        },
        503
      );
    }
  },
});
