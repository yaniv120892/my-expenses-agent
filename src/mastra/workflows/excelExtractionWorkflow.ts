import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  structureAnalysisAgent,
  metadataExtractionAgent,
  transactionExtractionAgent,
  getTemperature,
} from "../agents/extractionAgents";
import { getFileService } from "../lib/fileService";
import {
  parseWorkbook,
  getFirstSheet,
  sheetToText,
  sheetRows,
  isEmptyRow,
  chunkRows,
  formatChunkForAI,
  rowToRawData,
  ExcelRow,
} from "../lib/excel";
import {
  filterValidTransactions,
  cleanTransactionDescriptions,
} from "../lib/clean";
import { withRetries, getAiTimeoutMs } from "../lib/retry";
import { logger } from "../lib/logger";
import {
  AIStructureAnalysisSchema,
  AIMetadataSchema,
  AITransactionsSchema,
  ExtractionResultSchema,
  StructureAnalysisSchema,
  ExtractedMetadataSchema,
  ExtractedTransaction,
  ExtractedMetadata,
  AIMetadata,
} from "../types/schemas";

const WorkflowInputSchema = z.object({
  requestId: z.string(),
  fileUrl: z.string(),
  filename: z.string(),
  userId: z.string().optional(),
  options: z.object({
    confidenceThreshold: z.number(),
    maxRetries: z.number(),
    includeRawData: z.boolean(),
  }),
  startTime: z.number(),
});

type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

const ParsedFileSchema = z.object({
  sheetText: z.string(),
  rows: z.array(z.array(z.any())),
  notes: z.array(z.string()),
});

const StructureStepOutputSchema = z.object({
  structure: StructureAnalysisSchema,
  notes: z.array(z.string()),
});

const MetadataStepOutputSchema = z.object({
  structure: StructureAnalysisSchema,
  metadata: ExtractedMetadataSchema,
  notes: z.array(z.string()),
});

const TransactionsStepOutputSchema = z.object({
  structure: StructureAnalysisSchema,
  metadata: ExtractedMetadataSchema,
  transactions: z.array(z.any()),
  notes: z.array(z.string()),
});

function getChunkSize(): number {
  return parseInt(process.env.EXTRACTION_CHUNK_SIZE || "200", 10);
}

function buildStructureAnalysisPrompt(textData: string): string {
  return `
Analyze this Excel file structure and identify:

1. Header row location (0-based index)
2. Data start row (0-based index, first row with actual transaction data)
3. Column mappings for: date, description, amount (0-based column indices)
4. File format type (American Express, Visa, Mastercard, CAL, Bank statement, etc.)
5. Any special formatting or patterns

Excel Data:
${textData}
`;
}

function buildMetadataExtractionPrompt(textData: string): string {
  return `
Extract metadata from this Excel file. ALL fields are REQUIRED:

1. Credit card last 4 digits (REQUIRED - look in headers, titles, or file metadata. Common patterns: "xxxx-1234", "כרטיס *1234", "ב-1234")
2. Payment month (REQUIRED - MM/YYYY format. Look for dates like "ינואר 2025", "01/2025", billing periods)
3. Bank source type (BANK_CREDIT for bank statements with "פירוט עסקאות לחשבון", NON_BANK_CREDIT for credit card statements, UNKNOWN if unclear)
4. Confidence level (0-1 based on data quality)

If you cannot find creditCardLastFour or paymentMonth, set confidence to 0 and explain in the response.

Excel Data:
${textData}
`;
}

function buildTransactionExtractionPrompt(formattedData: string): string {
  return `
Extract all transactions from this data. Each transaction should have:
- date (DD/MM/YYYY format)
- description (clean business name, remove extra characters)
- value (positive number, expenses are positive)
- type (EXPENSE or INCOME)
- sourceRow (the exact N from the "Row N:" prefix of the input line the transaction came from)

Data:
${formattedData}
`;
}

function convertAIMetadataToMetadata(aiResult: AIMetadata): ExtractedMetadata {
  const { creditCardLastFour, paymentMonth } = aiResult;

  if (!creditCardLastFour || !paymentMonth) {
    const missing = [];
    if (!creditCardLastFour) missing.push("creditCardLastFour");
    if (!paymentMonth) missing.push("paymentMonth");

    logger.error("Missing required metadata fields", {
      missing,
      aiResult,
    });

    throw new Error(
      `Failed to extract required metadata: ${missing.join(", ")}. ` +
        `Please ensure the Excel file contains credit card number and payment month information.`
    );
  }

  return {
    creditCardLastFour,
    bankSourceType: aiResult.bankSourceType || "UNKNOWN",
    paymentMonth,
    confidence: aiResult.confidence || 0,
  };
}

const downloadAndParseStep = createStep({
  id: "download-and-parse",
  inputSchema: WorkflowInputSchema,
  outputSchema: ParsedFileSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    const fileService = getFileService();

    logger.info("Starting Excel extraction", {
      requestId: inputData.requestId,
      filename: inputData.filename,
      provider: fileService.getProvider(),
    });

    const buffer = await fileService.downloadFile(inputData.fileUrl);
    const workbook = parseWorkbook(buffer);
    const sheet = getFirstSheet(workbook);

    return {
      sheetText: sheetToText(sheet, inputData.filename),
      rows: sheetRows(sheet),
      notes: [
        `File downloaded and parsed successfully from ${fileService.getProvider()}`,
      ],
    };
  },
});

const analyzeStructureStep = createStep({
  id: "analyze-structure",
  inputSchema: ParsedFileSchema,
  outputSchema: StructureStepOutputSchema,
  execute: async ({ inputData, getInitData }) => {
    const init = getInitData<WorkflowInput>();
    const prompt = buildStructureAnalysisPrompt(inputData.sheetText);

    const structure = await withRetries(
      async (signal) => {
        const response = await structureAnalysisAgent.generate(prompt, {
          structuredOutput: { schema: AIStructureAnalysisSchema },
          modelSettings: { temperature: getTemperature() },
          abortSignal: signal,
        });
        return AIStructureAnalysisSchema.parse(response.object);
      },
      {
        attempts: init.options.maxRetries,
        timeoutMs: getAiTimeoutMs(),
        label: "Structure analysis",
      }
    );

    logger.info("AI Structure Analysis Result", {
      requestId: init.requestId,
      structure,
    });

    return {
      structure,
      notes: [
        ...inputData.notes,
        `Structure analysis completed: ${structure.summary}`,
      ],
    };
  },
});

const extractMetadataStep = createStep({
  id: "extract-metadata",
  inputSchema: StructureStepOutputSchema,
  outputSchema: MetadataStepOutputSchema,
  execute: async ({ inputData, getInitData, getStepResult }) => {
    const init = getInitData<WorkflowInput>();
    const { sheetText } = getStepResult(downloadAndParseStep);
    const prompt = buildMetadataExtractionPrompt(sheetText);

    const aiMetadata = await withRetries(
      async (signal) => {
        const response = await metadataExtractionAgent.generate(prompt, {
          structuredOutput: { schema: AIMetadataSchema },
          modelSettings: { temperature: getTemperature() },
          abortSignal: signal,
        });
        return AIMetadataSchema.parse(response.object);
      },
      {
        attempts: init.options.maxRetries,
        timeoutMs: getAiTimeoutMs(),
        label: "Metadata extraction",
      }
    );

    const metadata = convertAIMetadataToMetadata(aiMetadata);

    return {
      structure: inputData.structure,
      metadata,
      notes: [
        ...inputData.notes,
        `Metadata extracted with confidence: ${metadata.confidence}`,
      ],
    };
  },
});

const extractTransactionsStep = createStep({
  id: "extract-transactions",
  inputSchema: MetadataStepOutputSchema,
  outputSchema: TransactionsStepOutputSchema,
  execute: async ({ inputData, getInitData, getStepResult }) => {
    const init = getInitData<WorkflowInput>();
    const { rows } = getStepResult(downloadAndParseStep);
    const { structure } = inputData;

    const dataRows = (rows as ExcelRow[]).slice(structure.dataStartRow);
    const indexedRows = dataRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !isEmptyRow(row));

    const chunkSize = getChunkSize();
    const chunks = chunkRows(indexedRows, chunkSize);
    const transactions: ExtractedTransaction[] = [];

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const prompt = buildTransactionExtractionPrompt(
        formatChunkForAI(chunk, structure.columnMappings)
      );

      const aiResult = await withRetries(
        async (signal) => {
          const response = await transactionExtractionAgent.generate(prompt, {
            structuredOutput: { schema: AITransactionsSchema },
            modelSettings: { temperature: getTemperature() },
            abortSignal: signal,
          });
          return AITransactionsSchema.parse(response.object);
        },
        {
          attempts: init.options.maxRetries,
          timeoutMs: getAiTimeoutMs(),
          label: `Transaction extraction (chunk ${chunkIndex + 1}/${chunks.length})`,
        }
      );

      for (const transaction of aiResult.transactions) {
        const sourceIndex = transaction.sourceRow - 1;
        const sourceRow = dataRows[sourceIndex];
        transactions.push({
          date: transaction.date,
          description: transaction.description,
          value: transaction.value,
          type: transaction.type,
          rawData:
            init.options.includeRawData && sourceRow
              ? rowToRawData(sourceRow)
              : {},
        });
      }

      logger.info("Transaction chunk extracted", {
        requestId: init.requestId,
        chunk: chunkIndex + 1,
        totalChunks: chunks.length,
        chunkTransactions: aiResult.transactions.length,
      });
    }

    return {
      structure,
      metadata: inputData.metadata,
      transactions,
      notes: [
        ...inputData.notes,
        `Extracted ${transactions.length} transactions`,
        `Processed ${indexedRows.length} data rows in ${chunks.length} chunk(s)`,
      ],
    };
  },
});

const validateAndCleanStep = createStep({
  id: "validate-and-clean",
  inputSchema: TransactionsStepOutputSchema,
  outputSchema: ExtractionResultSchema,
  execute: async ({ inputData, getInitData }) => {
    const init = getInitData<WorkflowInput>();
    const transactions = inputData.transactions as ExtractedTransaction[];
    const notes = [...inputData.notes];

    const validTransactions = filterValidTransactions(transactions);
    notes.push(
      `Validated ${validTransactions.length} transactions (removed ${
        transactions.length - validTransactions.length
      } invalid)`
    );

    const cleanedTransactions = cleanTransactionDescriptions(validTransactions);

    if (inputData.metadata.confidence < init.options.confidenceThreshold) {
      notes.push(
        `Warning: Low confidence score (${inputData.metadata.confidence}) below threshold (${init.options.confidenceThreshold})`
      );
    }

    const processingTime = Date.now() - init.startTime;

    logger.info("Excel extraction completed", {
      requestId: init.requestId,
      transactionsCount: cleanedTransactions.length,
      processingTime,
      confidence: inputData.metadata.confidence,
    });

    return {
      transactions: cleanedTransactions,
      metadata: inputData.metadata,
      structure: inputData.structure,
      processingNotes: notes,
      processingTime,
    };
  },
});

export const excelExtractionWorkflow = createWorkflow({
  id: "excelExtractionWorkflow",
  inputSchema: WorkflowInputSchema,
  outputSchema: ExtractionResultSchema,
})
  .then(downloadAndParseStep)
  .then(analyzeStructureStep)
  .then(extractMetadataStep)
  .then(extractTransactionsStep)
  .then(validateAndCleanStep)
  .commit();
