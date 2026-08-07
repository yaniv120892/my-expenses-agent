import { describe, it, expect, vi, beforeAll } from "vitest";
import { buildSyntheticStatement } from "../helpers/syntheticStatement";
import { ExtractionResult } from "../../src/mastra/types/schemas";

// Real-model eval: runs the actual workflow (real Gemini agents, real
// structured output) against a synthetic Hebrew Visa statement and grades the
// extraction. Requires GEMINI_API_KEY; skipped otherwise. Run with:
//   npm run test:eval
const hasApiKey = Boolean(process.env.GEMINI_API_KEY);

// 260 rows forces two chunks at the default EXTRACTION_CHUNK_SIZE of 200,
// proving the old 100-row truncation is gone.
const statement = buildSyntheticStatement(260);

vi.mock("../../src/mastra/lib/fileService", () => ({
  getFileService: () => ({
    downloadFile: async () => statement.buffer,
    getProvider: () => "s3",
  }),
}));

describe.skipIf(!hasApiKey)("extraction eval (real Gemini)", () => {
  let result: ExtractionResult;

  beforeAll(async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= process.env.GEMINI_API_KEY;
    const { excelExtractionWorkflow } = await import(
      "../../src/mastra/workflows/excelExtractionWorkflow"
    );

    const run = await excelExtractionWorkflow.createRun();
    const outcome = await run.start({
      inputData: {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        fileUrl: "https://bucket.s3.eu-west-3.amazonaws.com/imports/eval.xlsx",
        filename: "eval-visa-9114.xlsx",
        options: {
          confidenceThreshold: 0.7,
          maxRetries: 2,
          includeRawData: false,
        },
        startTime: Date.now(),
      },
    });

    if (outcome.status !== "success") {
      throw new Error(
        `Workflow did not succeed: ${JSON.stringify(
          "error" in outcome ? outcome.error : outcome.status
        )}`
      );
    }
    result = outcome.result as ExtractionResult;

    console.log("eval report:", {
      expectedRows: statement.transactions.length,
      extracted: result.transactions.length,
      recall: (
        result.transactions.length / statement.transactions.length
      ).toFixed(3),
      metadata: result.metadata,
      structure: result.structure,
      notes: result.processingNotes,
    });
  }, 600000);

  it("extracts the card last-four digits from the Hebrew title", () => {
    expect(result.metadata.creditCardLastFour).toBe(statement.cardLastFour);
  });

  it("extracts the payment month in MM/YYYY", () => {
    expect(result.metadata.paymentMonth).toBe(statement.paymentMonth);
  });

  it("finds the data start row from the structure analysis", () => {
    expect(result.structure.dataStartRow).toBe(statement.dataStartRow);
  });

  it("achieves at least 95% transaction recall across both chunks", () => {
    const recall =
      result.transactions.length / statement.transactions.length;
    expect(recall).toBeGreaterThanOrEqual(0.95);
    // No hallucinated extras beyond the source rows.
    expect(result.transactions.length).toBeLessThanOrEqual(
      statement.transactions.length
    );
  });

  it("processes the rows in more than one chunk (no 100-row truncation)", () => {
    const chunkNote = result.processingNotes.find((n) =>
      n.includes("chunk(s)")
    );
    expect(chunkNote).toBeDefined();
    expect(chunkNote).toContain("2 chunk(s)");
  });

  it("returns well-formed transactions", () => {
    for (const tx of result.transactions) {
      expect(tx.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(tx.value).toBeGreaterThan(0);
      expect(["EXPENSE", "INCOME"]).toContain(tx.type);
      expect(tx.description.length).toBeGreaterThan(0);
    }
  });

  it("matches amounts for the transactions it extracted", () => {
    const expectedAmounts = new Set(
      statement.transactions.map((t) => t.amount)
    );
    const matching = result.transactions.filter((t) =>
      expectedAmounts.has(t.value)
    );
    // At least 90% of extracted values should be verbatim source amounts.
    expect(matching.length / result.transactions.length).toBeGreaterThanOrEqual(
      0.9
    );
  });
});

describe.skipIf(hasApiKey)("extraction eval (skipped)", () => {
  it("is skipped because GEMINI_API_KEY is not set", () => {
    expect(hasApiKey).toBe(false);
  });
});
