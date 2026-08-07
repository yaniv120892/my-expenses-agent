import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { VercelDeployer } from "@mastra/deployer-vercel";
import {
  structureAnalysisAgent,
  metadataExtractionAgent,
  transactionExtractionAgent,
} from "./agents/extractionAgents";
import { excelExtractionWorkflow } from "./workflows/excelExtractionWorkflow";
import { extractRoute } from "./routes/extractRoute";
import { statusRoute } from "./routes/statusRoute";
import { healthRoute } from "./routes/healthRoute";

// The model router looks up GOOGLE_GENERATIVE_AI_API_KEY; this service has
// always been configured via GEMINI_API_KEY, so keep that working.
process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= process.env.GEMINI_API_KEY;

export const mastra = new Mastra({
  agents: {
    structureAnalysisAgent,
    metadataExtractionAgent,
    transactionExtractionAgent,
  },
  workflows: {
    excelExtractionWorkflow,
  },
  logger: new PinoLogger({
    name: "excel-extraction-service",
    level:
      (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info",
  }),
  deployer: new VercelDeployer({
    maxDuration: 300,
    memory: 1024,
  }),
  server: {
    port: Number(process.env.PORT ?? 4111),
    // Mastra's built-in routes move to /mastra-api so the public contract
    // (/api/extract, /api/status/:requestId, /api/health) keeps its paths.
    apiPrefix: "/mastra-api",
    apiRoutes: [extractRoute, statusRoute, healthRoute],
  },
});
