import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSyntheticStatement } from "../helpers/syntheticStatement";
import {
  AIStructureAnalysisSchema,
  AIMetadataSchema,
  AITransactionsSchema,
  ExtractionResult,
} from "../../src/mastra/types/schemas";

const statement = buildSyntheticStatement(250);

// The workflow talks to the agents and the file service through these
// modules; mocking them exercises the real workflow engine, chunking,
// rawData wiring and note ordering without any network calls.
const generateStructure = vi.fn();
const generateMetadata = vi.fn();
const generateTransactions = vi.fn();

vi.mock("../../src/mastra/agents/extractionAgents", () => ({
  structureAnalysisAgent: { generate: (...args: unknown[]) => generateStructure(...args) },
  metadataExtractionAgent: { generate: (...args: unknown[]) => generateMetadata(...args) },
  transactionExtractionAgent: { generate: (...args: unknown[]) => generateTransactions(...args) },
  getTemperature: () => 0.1,
}));

vi.mock("../../src/mastra/lib/fileService", () => ({
  getFileService: () => ({
    downloadFile: async () => statement.buffer,
    getProvider: () => "s3",
  }),
}));

import { excelExtractionWorkflow } from "../../src/mastra/workflows/excelExtractionWorkflow";

const structureObject = {
  headerRow: statement.headerRow,
  dataStartRow: statement.dataStartRow,
  columnMappings: { date: 0, description: 1, amount: 2 },
  fileType: "Visa",
  confidence: 0.95,
  summary: "Visa statement with Hebrew headers",
};

const metadataObject = {
  creditCardLastFour: statement.cardLastFour,
  bankSourceType: "NON_BANK_CREDIT",
  paymentMonth: statement.paymentMonth,
  confidence: 0.9,
};

// Parses the prompt's `Row N: Date="..." | Description="..." | Amount="..."`
// lines back into transactions, echoing N as sourceRow — like a perfect model.
function transactionsFromPrompt(prompt: string) {
  const matches = prompt.matchAll(
    /Row (\d+): Date="([^"]*)" \| Description="([^"]*)" \| Amount="([^"]*)"/g
  );
  return [...matches].map((m) => ({
    date: m[2],
    description: m[3],
    value: parseFloat(m[4]),
    type: "EXPENSE" as const,
    sourceRow: parseInt(m[1], 10),
  }));
}

function primeHappyPath() {
  generateStructure.mockResolvedValue({
    object: AIStructureAnalysisSchema.parse(structureObject),
  });
  generateMetadata.mockResolvedValue({
    object: AIMetadataSchema.parse(metadataObject),
  });
  generateTransactions.mockImplementation(async (prompt: string) => ({
    object: AITransactionsSchema.parse({
      transactions: transactionsFromPrompt(prompt),
    }),
  }));
}

async function runWorkflow(options?: Partial<{ includeRawData: boolean; maxRetries: number }>) {
  const run = await excelExtractionWorkflow.createRun();
  return run.start({
    inputData: {
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      fileUrl: "https://bucket.s3.eu-west-3.amazonaws.com/imports/test.xlsx",
      filename: "test.xlsx",
      options: {
        confidenceThreshold: 0.7,
        maxRetries: options?.maxRetries ?? 3,
        includeRawData: options?.includeRawData ?? false,
      },
      startTime: Date.now(),
    },
  });
}

beforeEach(() => {
  generateStructure.mockReset();
  generateMetadata.mockReset();
  generateTransactions.mockReset();
  process.env.EXTRACTION_CHUNK_SIZE = "100";
});

describe("excelExtractionWorkflow", () => {
  it("extracts every row with no truncation, chunking the AI calls", async () => {
    primeHappyPath();

    const outcome = await runWorkflow();
    expect(outcome.status).toBe("success");
    const result = (outcome as { result: ExtractionResult }).result;

    // 250 data rows at chunk size 100 → 3 AI calls, all rows extracted.
    expect(generateTransactions).toHaveBeenCalledTimes(3);
    expect(result.transactions).toHaveLength(250);
    expect(result.transactions[0].description).toContain("שופרסל");
    expect(result.metadata.creditCardLastFour).toBe("9114");
    expect(result.metadata.paymentMonth).toBe("07/2025");
    expect(result.structure.dataStartRow).toBe(3);
    expect(result.processingTime).toBeGreaterThan(0);
  });

  it("keeps the processing notes in the legacy order", async () => {
    primeHappyPath();

    const outcome = await runWorkflow();
    const notes = (outcome as { result: ExtractionResult }).result
      .processingNotes;

    expect(notes[0]).toContain("File downloaded and parsed successfully");
    expect(notes[1]).toContain("Structure analysis completed");
    expect(notes[2]).toContain("Metadata extracted with confidence");
    expect(notes[3]).toBe("Extracted 250 transactions");
    expect(notes[4]).toContain("3 chunk(s)");
    expect(notes[5]).toContain("Validated 250 transactions (removed 0 invalid)");
  });

  it("honors includeRawData by attaching the source row cells", async () => {
    primeHappyPath();

    const withRaw = await runWorkflow({ includeRawData: true });
    const withRawResult = (withRaw as { result: ExtractionResult }).result;
    expect(withRawResult.transactions[0].rawData).toMatchObject({
      "0": statement.transactions[0].date,
      "1": statement.transactions[0].description,
    });

    const withoutRaw = await runWorkflow({ includeRawData: false });
    const withoutRawResult = (withoutRaw as { result: ExtractionResult })
      .result;
    expect(withoutRawResult.transactions[0].rawData).toEqual({});
  });

  it("fails with the legacy friendly error when metadata is missing", async () => {
    primeHappyPath();
    generateMetadata.mockResolvedValue({
      object: { bankSourceType: "UNKNOWN", confidence: 0 },
    });

    const outcome = await runWorkflow({ maxRetries: 1 });
    expect(outcome.status).toBe("failed");
    const error = (outcome as { error: unknown }).error;
    const message =
      error instanceof Error ? error.message : JSON.stringify(error);
    expect(message).toContain(
      "Failed to extract required metadata: creditCardLastFour, paymentMonth"
    );
  });

  it("retries AI calls up to options.maxRetries", async () => {
    primeHappyPath();
    generateStructure
      .mockRejectedValueOnce(new Error("transient 1"))
      .mockRejectedValueOnce(new Error("transient 2"))
      .mockResolvedValue({
        object: AIStructureAnalysisSchema.parse(structureObject),
      });

    const outcome = await runWorkflow({ maxRetries: 3 });
    expect(outcome.status).toBe("success");
    expect(generateStructure).toHaveBeenCalledTimes(3);
  }, 20000);

  it("does not retry beyond options.maxRetries", async () => {
    primeHappyPath();
    generateStructure.mockRejectedValue(new Error("hard failure"));

    const outcome = await runWorkflow({ maxRetries: 1 });
    expect(outcome.status).toBe("failed");
    expect(generateStructure).toHaveBeenCalledTimes(1);
  });
});
