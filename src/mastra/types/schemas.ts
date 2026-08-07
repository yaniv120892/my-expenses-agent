import { z } from "zod";

export enum RequestStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export const ExtractDataRequestSchema = z.object({
  fileUrl: z.string().url("Invalid file URL"),
  filename: z.string().min(1, "Filename is required"),
  userId: z.string().uuid("Invalid user ID").optional(),
  webhookUrl: z.string().url("Invalid webhook URL"),
  options: z
    .object({
      confidenceThreshold: z.number().min(0).max(1).default(0.7),
      maxRetries: z.number().min(1).max(5).default(3),
      includeRawData: z.boolean().default(false),
    })
    .optional(),
});

export type ExtractDataRequest = z.infer<typeof ExtractDataRequestSchema>;

export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>;

export const ExtractedTransactionSchema = z.object({
  date: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, "Invalid date format"),
  description: z.string().min(1).max(200),
  value: z.number().positive("Value must be positive"),
  type: z.enum(["EXPENSE", "INCOME"]),
  rawData: z.record(z.union([z.string(), z.number()])).optional(),
});

export const ExtractedMetadataSchema = z.object({
  creditCardLastFour: z
    .string()
    .regex(/^\d{4}$/, "Credit card last four digits required"),
  bankSourceType: z
    .enum(["BANK_CREDIT", "NON_BANK_CREDIT", "UNKNOWN"])
    .optional(),
  paymentMonth: z
    .string()
    .regex(/^\d{2}\/\d{4}$/, "Payment month required in MM/YYYY format"),
  confidence: z.number().min(0).max(1),
});

export const StructureAnalysisSchema = z.object({
  headerRow: z.number().int().min(0),
  dataStartRow: z.number().int().min(0),
  columnMappings: z.object({
    date: z.number().int().min(0),
    description: z.number().int().min(0),
    amount: z.number().int().min(0),
  }),
  fileType: z.string(),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

export const ExtractionResultSchema = z.object({
  transactions: z.array(ExtractedTransactionSchema),
  metadata: ExtractedMetadataSchema,
  structure: StructureAnalysisSchema,
  processingNotes: z.array(z.string()),
  processingTime: z.number().positive(),
});

export const ExtractionRequestSchema = z.object({
  requestId: z.string().uuid(),
  status: z.nativeEnum(RequestStatus),
  fileUrl: z.string().url(),
  filename: z.string().min(1),
  userId: z.string().uuid().optional(),
  webhookUrl: z.string().url(),
  options: z
    .object({
      confidenceThreshold: z.number().min(0).max(1),
      maxRetries: z.number().min(1).max(5),
      includeRawData: z.boolean(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  result: ExtractionResultSchema.optional(),
});

export const RequestStatusResponseSchema = z.object({
  requestId: z.string().uuid(),
  status: z.nativeEnum(RequestStatus),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  result: ExtractionResultSchema.optional(),
});

export type RequestStatusResponse = z.infer<typeof RequestStatusResponseSchema>;

export const WebhookPayloadSchema = z.object({
  requestId: z.string().uuid(),
  status: z.union([
    z.literal(RequestStatus.COMPLETED),
    z.literal(RequestStatus.FAILED),
  ]),
  result: ExtractionResultSchema.optional(),
  error: z.string().optional(),
  completedAt: z.string().datetime(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>;
export type ExtractedMetadata = z.infer<typeof ExtractedMetadataSchema>;
export type StructureAnalysis = z.infer<typeof StructureAnalysisSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export interface ExtractionOptions {
  confidenceThreshold: number;
  maxRetries: number;
  includeRawData: boolean;
}

// AI-side schemas: what the model is asked to return. They are deliberately
// laxer than the public contract schemas above — required-field enforcement
// with user-friendly errors happens in the workflow steps.

export const AIStructureAnalysisSchema = StructureAnalysisSchema;

export const AIMetadataSchema = z.object({
  creditCardLastFour: z.string().optional(),
  bankSourceType: z
    .enum(["BANK_CREDIT", "NON_BANK_CREDIT", "UNKNOWN"])
    .optional(),
  paymentMonth: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const AITransactionsSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      value: z.number(),
      type: z.enum(["EXPENSE", "INCOME"]),
      sourceRow: z
        .number()
        .int()
        .describe(
          "The row number exactly as it appears in the input data (the N in \"Row N\")"
        ),
    })
  ),
});

export type AIMetadata = z.infer<typeof AIMetadataSchema>;
export type AITransactions = z.infer<typeof AITransactionsSchema>;
