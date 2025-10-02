import { Request, Response } from 'express';
import { ExcelExtractionAgent } from '../services/excelAgent';
import { AIProvider } from '../services/aiProvider';
import { FileServiceFactory } from '../services/fileServiceFactory';
import { 
  ExtractDataRequestSchema, 
  ExtractionResponseSchema,
  ErrorResponseSchema 
} from '../types/validation';
import { ProcessingContext } from '../types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

interface ValidatedRequest {
  fileUrl: string;
  filename: string;
  userId?: string;
  options?: {
    confidenceThreshold?: number;
    maxRetries?: number;
    includeRawData?: boolean;
  };
}

export class ExtractionController {
  private excelAgent: ExcelExtractionAgent;

  constructor() {
    this.excelAgent = this.createExcelAgent();
  }

  async extractData(req: Request, res: Response): Promise<void> {
    const requestId = uuidv4();
    
    try {
      const validationResult = this.validateRequest(req.body);
      if (!validationResult.success) {
        this.sendValidationError(res, validationResult.error, requestId);
        return;
      }

      const { fileUrl, filename, userId, options } = validationResult.data as ValidatedRequest;
      const context = this.createProcessingContext(requestId, fileUrl, filename, userId, options);

      logger.info('Processing extraction request', { requestId, filename, userId });

      const result = await this.excelAgent.extractData(context);
      const response = this.createSuccessResponse(result, requestId);

      res.status(200).json(response);

    } catch (error) {
      this.handleExtractionError(error, requestId, res);
    }
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    const response = this.createHealthResponse();
    res.status(200).json(response);
  }

  private createExcelAgent(): ExcelExtractionAgent {
    const aiProvider = this.createAIProvider();
    const fileService = this.createFileService();
    return new ExcelExtractionAgent(aiProvider, fileService);
  }

  private createAIProvider(): AIProvider {
    return new AIProvider({
      model: process.env.AI_MODEL || 'gemini-2.0-flash',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2000'),
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1'),
      timeout: parseInt(process.env.AI_TIMEOUT || '60000'),
      apiKey: process.env.GEMINI_API_KEY || ''
    });
  }

  private createFileService() {
    const provider = (process.env.FILE_SERVICE_PROVIDER || 's3') as 's3' | 'gcs' | 'azure' | 'local';
    return FileServiceFactory.createFileService(provider);
  }

  private validateRequest(body: unknown): { success: boolean; data?: unknown; error?: unknown } {
    const result = ExtractDataRequestSchema.safeParse(body);
    return {
      success: result.success,
      data: result.success ? result.data : undefined,
      error: result.success ? undefined : result.error
    };
  }

  private createProcessingContext(
    requestId: string, 
    fileUrl: string, 
    filename: string, 
    userId?: string, 
    options?: ValidatedRequest['options']
  ): ProcessingContext {
    return {
      requestId,
      userId,
      filename,
      fileUrl,
      startTime: Date.now(),
      options: {
        confidenceThreshold: 0.7,
        maxRetries: 3,
        includeRawData: false,
        ...options
      }
    };
  }

  private createSuccessResponse(result: unknown, requestId: string): unknown {
    return ExtractionResponseSchema.parse({
      success: true,
      data: result,
      message: 'Data extracted successfully',
      requestId
    });
  }

  private createHealthResponse(): unknown {
    return {
      status: 'healthy' as const,
      service: 'excel-extraction-service' as const,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  private sendValidationError(res: Response, error: unknown, requestId: string): void {
    const errorResponse = ErrorResponseSchema.parse({
      success: false,
      error: 'Validation failed',
      message: this.getErrorMessage(error),
      requestId,
      timestamp: new Date().toISOString()
    });
    
    res.status(400).json(errorResponse);
  }

  private handleExtractionError(error: unknown, requestId: string, res: Response): void {
    logger.error('Extraction request failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const errorResponse = ErrorResponseSchema.parse({
      success: false,
      error: 'Extraction failed',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      requestId,
      timestamp: new Date().toISOString()
    });

    res.status(500).json(errorResponse);
  }

  private getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'errors' in error) {
      const errors = error.errors as Array<{ message: string }>;
      return errors.map(e => e.message).join(', ');
    }
    return 'Validation failed';
  }
}
