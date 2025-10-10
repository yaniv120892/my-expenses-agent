import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { FileService, FileServiceProvider } from "../types/fileService";
import { logger } from "../utils/logger";

export class FileServiceProviderImpl implements FileService {
  private client?: S3Client;
  private provider: FileServiceProvider;
  private config: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };

  constructor(provider: FileServiceProvider) {
    this.provider = provider;
    this.config = this.loadConfigFromEnv();

    if (provider === "s3") {
      this.client = this.createS3Client();
    } else {
      throw new Error(`Unsupported file service provider: ${provider}`);
    }
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    if (this.provider !== "s3") {
      throw new Error(
        `Provider ${this.provider} is not implemented yet. Only S3 is supported.`
      );
    }

    try {
      return await this.downloadFromS3(fileUrl);
    } catch (error) {
      logger.error("File download error:", error);
      throw new Error(
        `Failed to download file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  getProvider(): string {
    return this.provider;
  }

  private loadConfigFromEnv(): {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  } {
    const region = process.env.FILE_SERVICE_REGION;
    const accessKeyId = process.env.FILE_SERVICE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.FILE_SERVICE_SECRET_ACCESS_KEY;
    const bucketName = process.env.FILE_SERVICE_BUCKET_NAME;

    if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error(
        "Missing required file service environment variables: FILE_SERVICE_REGION, FILE_SERVICE_ACCESS_KEY_ID, FILE_SERVICE_SECRET_ACCESS_KEY, FILE_SERVICE_BUCKET_NAME"
      );
    }

    return {
      region,
      accessKeyId,
      secretAccessKey,
      bucketName,
    };
  }

  private createS3Client(): S3Client {
    return new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  private async downloadFromS3(fileUrl: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error("S3 client not initialized");
    }

    const key = this.extractKeyFromUrl(fileUrl);
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error("No file content received from S3");
    }

    return await this.streamToBuffer(response.Body);
  }

  private extractKeyFromUrl(fileUrl: string): string {
    try {
      const url = new URL(fileUrl);
      return decodeURIComponent(url.pathname.slice(1));
    } catch (error) {
      throw new Error(`Invalid file URL format: ${fileUrl}`);
    }
  }

  private async streamToBuffer(body: unknown): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    const stream = body as {
      [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array>;
    };

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }
}
