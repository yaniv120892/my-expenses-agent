import { PinoLogger } from "@mastra/loggers";

export const logger = new PinoLogger({
  name: "excel-extraction-service",
  level: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "info",
});
