import { Agent } from "@mastra/core/agent";

// Same model the pre-Mastra service used (was hardcoded in
// extractionController.ts), now defined once for all three agents. The
// explicit apiKey keeps the existing GEMINI_API_KEY env var working — the
// model router's default lookup is GOOGLE_GENERATIVE_AI_API_KEY.
const model = () => ({
  id: "google/gemini-2.5-flash" as const,
  apiKey: process.env.GEMINI_API_KEY,
});

export function getTemperature(): number {
  return parseFloat(process.env.AI_TEMPERATURE || "0.1");
}

export const structureAnalysisAgent = new Agent({
  id: "structure-analysis-agent",
  name: "structure-analysis-agent",
  instructions:
    "You are an expert Excel analyst specializing in financial documents. Be precise with column indices and row numbers.",
  model: model(),
});

export const metadataExtractionAgent = new Agent({
  id: "metadata-extraction-agent",
  name: "metadata-extraction-agent",
  instructions:
    "You are an expert at extracting financial metadata from Excel files. credit card last four digits and payment month are REQUIRED fields - search thoroughly in all rows. If you cannot find them with high confidence, set confidence to 0. Be conservative with confidence scores.",
  model: model(),
});

export const transactionExtractionAgent = new Agent({
  id: "transaction-extraction-agent",
  name: "transaction-extraction-agent",
  instructions:
    "You are an expert at extracting financial transactions from Excel data. Clean descriptions and normalize data.",
  model: model(),
});
