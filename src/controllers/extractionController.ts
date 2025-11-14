import { Request, Response } from "express";
import { ExcelExtractionAgentClient } from "../services/excelAgent";
import { AIProvider } from "../services/aiProvider";
import { FileServiceFactory } from "../services/fileServiceFactory";
import { ExtractionRequestStore } from "../repositories/extractionRequestStore";
import { WebhookService } from "../services/webhookService";
import {
  ExtractDataRequestSchema,
  ExtractDataRequest,
  ExtractionRequest,
  RequestStatus,
} from "../types/schemas";
import { ProcessingContext } from "../types";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

export class ExtractionController {
  private excelAgent: ExcelExtractionAgentClient;
  private requestStore: ExtractionRequestStore;
  private webhookService: WebhookService;

  constructor() {
    this.excelAgent = this.createExcelAgent();
    this.requestStore = new ExtractionRequestStore();
    this.webhookService = new WebhookService();
  }

  async extractData(req: Request, res: Response): Promise<void> {
    const requestId = uuidv4();

    try {
      const validationResult = this.validateRequest(req.body);
      if (!validationResult.success) {
        this.sendValidationError(
          res,
          validationResult.error || "Validation failed",
          requestId
        );
        return;
      }

      const { fileUrl, filename, userId, webhookUrl, options } =
        validationResult.data!;

      const extractionRequest: ExtractionRequest = {
        requestId,
        status: RequestStatus.PENDING,
        fileUrl,
        filename,
        userId,
        webhookUrl,
        options: {
          confidenceThreshold: options?.confidenceThreshold || 0.7,
          maxRetries: options?.maxRetries || 3,
          includeRawData: options?.includeRawData || false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.requestStore.createRequest(extractionRequest);

      logger.info("Async extraction request created", {
        requestId,
        filename,
        userId,
        webhookUrl,
        fileUrl: fileUrl.substring(0, 100) + "...",
      });

      this.processExtractionAsync(extractionRequest);

      const response = {
        success: true,
        message: "Extraction request submitted successfully",
        requestId,
        status: RequestStatus.PENDING,
        timestamp: new Date().toISOString(),
      };

      res.status(202).json(response);
    } catch (error) {
      this.handleExtractionError(error, requestId, res);
    }
  }

  async getRequestStatus(req: Request, res: Response): Promise<void> {
    const { requestId } = req.params;

    try {
      if (!requestId) {
        res.status(400).json({
          success: false,
          error: "Request ID is required",
          message: "Request ID parameter is missing",
          requestId: "",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const status = await this.requestStore.getRequestStatus(requestId);

      if (!status) {
        res.status(404).json({
          success: false,
          error: "Request not found",
          message: `No request found with ID: ${requestId}`,
          requestId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json(status);
    } catch (error) {
      logger.error("Failed to get request status", { requestId, error });
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: "Failed to retrieve request status",
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async processExtractionAsync(
    request: ExtractionRequest
  ): Promise<void> {
    const { requestId } = request;

    try {
      await this.requestStore.updateRequestStatus(
        requestId,
        RequestStatus.PROCESSING
      );

      const context = this.createProcessingContext(request);

      logger.info("Starting async extraction processing", {
        requestId,
        filename: request.filename,
        userId: request.userId,
      });

      const result = await this.excelAgent.extractData(context);

      logger.info("Async extraction completed successfully", {
        requestId,
        transactionCount: result.transactions.length,
        processingTime: result.processingTime,
      });

      await this.requestStore.updateRequestStatus(
        requestId,
        RequestStatus.COMPLETED,
        {
          result,
        }
      );

      await this.sendCompletionWebhook(request, result);
    } catch (error) {
      logger.error("Async extraction processing failed", { requestId, error });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await this.requestStore.updateRequestStatus(
        requestId,
        RequestStatus.FAILED,
        {
          error: errorMessage,
        }
      );

      await this.sendErrorWebhook(request, errorMessage);
    }
  }

  private async sendCompletionWebhook(
    request: ExtractionRequest,
    result: any
  ): Promise<void> {
    const payload = {
      requestId: request.requestId,
      status: RequestStatus.COMPLETED as RequestStatus.COMPLETED,
      result,
      completedAt: new Date().toISOString(),
    };

    const success = await this.webhookService.sendWebhookWithRetry(
      request.webhookUrl,
      payload,
      3
    );

    if (!success) {
      logger.error("Failed to send completion webhook after retries", {
        requestId: request.requestId,
        webhookUrl: request.webhookUrl,
      });
    }
  }

  private async sendErrorWebhook(
    request: ExtractionRequest,
    error: string
  ): Promise<void> {
    const payload = {
      requestId: request.requestId,
      status: RequestStatus.FAILED as RequestStatus.FAILED,
      error,
      completedAt: new Date().toISOString(),
    };

    const success = await this.webhookService.sendWebhookWithRetry(
      request.webhookUrl,
      payload,
      3
    );

    if (!success) {
      logger.error("Failed to send error webhook after retries", {
        requestId: request.requestId,
        webhookUrl: request.webhookUrl,
      });
    }
  }

  private createProcessingContext(
    request: ExtractionRequest
  ): ProcessingContext {
    return {
      requestId: request.requestId,
      fileUrl: request.fileUrl,
      filename: request.filename,
      userId: request.userId,
      options: request.options!,
      startTime: Date.now(),
    };
  }

  private createExcelAgent(): ExcelExtractionAgentClient {
    const aiProvider = this.createAIProvider();
    const fileService = this.createFileService();
    return new ExcelExtractionAgentClient(aiProvider, fileService);
  }

  private createAIProvider(): AIProvider {
    return new AIProvider({
      model: "gemini-2.5-flash",
      temperature: parseFloat(process.env.AI_TEMPERATURE || "0.1"),
      timeout: parseInt(process.env.AI_TIMEOUT || "60000"),
      apiKey: process.env.GEMINI_API_KEY || "",
    });
  }

  private createFileService() {
    const provider = (process.env.FILE_SERVICE_PROVIDER || "s3") as
      | "s3"
      | "gcs"
      | "local";
    return FileServiceFactory.createFileService(provider);
  }

  private validateRequest(body: any): {
    success: boolean;
    data?: ExtractDataRequest;
    error?: string;
  } {
    try {
      const validatedData = ExtractDataRequestSchema.parse(body);
      return { success: true, data: validatedData };
    } catch (error: any) {
      const errorMessage = error.errors
        ?.map((e: any) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return {
        success: false,
        error: errorMessage || "Invalid request data",
      };
    }
  }

  private sendValidationError(
    res: Response,
    error: string,
    requestId: string
  ): void {
    const response = {
      success: false,
      error,
      message: "Request validation failed",
      requestId,
      timestamp: new Date().toISOString(),
    };
    res.status(400).json(response);
  }

  private handleExtractionError(
    error: any,
    requestId: string,
    res: Response
  ): void {
    logger.error("Extraction error", { requestId, error });

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    const response = {
      success: false,
      error: errorMessage,
      message: "Extraction request failed",
      requestId,
      timestamp: new Date().toISOString(),
    };

    res.status(500).json(response);
  }
}
