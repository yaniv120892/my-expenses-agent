import { z } from 'zod';
import { 
  ExtractedTransactionSchema, 
  ExtractedMetadataSchema, 
  StructureAnalysisSchema 
} from './validation';

export type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>;
export type ExtractedMetadata = z.infer<typeof ExtractedMetadataSchema>;
export type StructureAnalysis = z.infer<typeof StructureAnalysisSchema>;

export interface ExtractionResult {
  transactions: ExtractedTransaction[];
  metadata: ExtractedMetadata;
  structure: StructureAnalysis;
  processingNotes: string[];
  processingTime: number;
}

export interface ExtractionOptions {
  confidenceThreshold: number;
  maxRetries: number;
  includeRawData: boolean;
}

export interface AIProviderConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  apiKey: string;
}

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface ProcessingContext {
  requestId: string;
  userId?: string;
  filename: string;
  fileUrl: string;
  startTime: number;
  options: ExtractionOptions;
}

export interface ServiceConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  ai: AIProviderConfig;
  s3: S3Config;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}
