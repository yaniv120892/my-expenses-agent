import { Redis } from "@upstash/redis";
import { logger } from "./logger";
import {
  ExtractionRequest,
  RequestStatusResponse,
  RequestStatus,
} from "../types/schemas";

export class ExtractionRequestStore {
  private client: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || "";
    const redisToken = process.env.REDIS_TOKEN || "";

    this.client = new Redis({
      url: redisUrl,
      token: redisToken,
    });
  }

  private getRequestKey(requestId: string): string {
    return `extraction_request:${requestId}`;
  }

  async createRequest(request: ExtractionRequest): Promise<void> {
    const key = this.getRequestKey(request.requestId);
    await this.client.set(key, request, { ex: 86400 });
    logger.info("Request created in Redis", { requestId: request.requestId });
  }

  async getRequest(requestId: string): Promise<ExtractionRequest | null> {
    const key = this.getRequestKey(requestId);
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    if (typeof data === "object") {
      return data as ExtractionRequest;
    }

    logger.error("Unexpected data type for request in Redis", {
      requestId,
      dataType: typeof data,
    });
    return null;
  }

  async updateRequestStatus(
    requestId: string,
    status: RequestStatus,
    updates: Partial<ExtractionRequest> = {}
  ): Promise<void> {
    const key = this.getRequestKey(requestId);
    const existingRequest = await this.getRequest(requestId);

    if (!existingRequest) {
      logger.warn("Attempted to update non-existent request", { requestId });
      return;
    }

    const updatedRequest: ExtractionRequest = {
      ...existingRequest,
      ...updates,
      status,
      updatedAt: new Date().toISOString(),
    };

    if (status === RequestStatus.PROCESSING && !updatedRequest.startedAt) {
      updatedRequest.startedAt = new Date().toISOString();
    } else if (
      (status === RequestStatus.COMPLETED || status === RequestStatus.FAILED) &&
      !updatedRequest.completedAt
    ) {
      updatedRequest.completedAt = new Date().toISOString();
    }

    await this.client.set(key, updatedRequest, { ex: 86400 });
    logger.info("Request status updated in Redis", { requestId, status });
  }

  async getRequestStatus(
    requestId: string
  ): Promise<RequestStatusResponse | null> {
    const request = await this.getRequest(requestId);

    if (!request) {
      return null;
    }

    return {
      requestId: request.requestId,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      error: request.error,
      result: request.result,
    };
  }

  async deleteRequest(requestId: string): Promise<void> {
    const key = this.getRequestKey(requestId);
    await this.client.del(key);
    logger.info("Request deleted from Redis", { requestId });
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      logger.error("Redis health check failed", { error: String(error) });
      return false;
    }
  }
}

export const requestStore = new ExtractionRequestStore();
