import { Router } from "express";
import { ExtractionController } from "../controllers/extractionController";
import { ExtractionRequestStore } from "../repositories/extractionRequestStore";

const router = Router();
const extractionController = new ExtractionController();
const requestStore = new ExtractionRequestStore();

router.post(
  "/extract",
  extractionController.extractData.bind(extractionController)
);
router.get(
  "/status/:requestId",
  extractionController.getRequestStatus.bind(extractionController)
);
router.get("/health", async (req, res) => {
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

    const statusCode = redisHealthy ? 200 : 503;
    res.status(statusCode).json(response);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      service: "excel-extraction-service",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      dependencies: {
        redis: "unhealthy",
      },
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
