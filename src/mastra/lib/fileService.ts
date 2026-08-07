import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "./logger";

export interface FileService {
  downloadFile(fileUrl: string): Promise<Buffer>;
  getProvider(): string;
}

class S3FileService implements FileService {
  private client: S3Client;
  private config: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  };

  constructor() {
    this.config = this.loadConfigFromEnv();
    this.client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    try {
      return await this.downloadFromS3(fileUrl);
    } catch (error) {
      logger.error("File download error", { error: String(error) });
      throw new Error(
        `Failed to download file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  getProvider(): string {
    return "s3";
  }

  private loadConfigFromEnv() {
    const region = process.env.FILE_SERVICE_REGION;
    const accessKeyId = process.env.FILE_SERVICE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.FILE_SERVICE_SECRET_ACCESS_KEY;
    const bucketName = process.env.FILE_SERVICE_BUCKET_NAME;

    if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error(
        "Missing required file service environment variables: FILE_SERVICE_REGION, FILE_SERVICE_ACCESS_KEY_ID, FILE_SERVICE_SECRET_ACCESS_KEY, FILE_SERVICE_BUCKET_NAME"
      );
    }

    return { region, accessKeyId, secretAccessKey, bucketName };
  }

  private async downloadFromS3(fileUrl: string): Promise<Buffer> {
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
    } catch {
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

// Constructed lazily so that importing the module (e.g. during `mastra dev`
// boot or `mastra build`) does not require S3 env vars to be present.
let instance: FileService | undefined;

export function getFileService(): FileService {
  const provider = process.env.FILE_SERVICE_PROVIDER || "s3";
  if (provider !== "s3") {
    throw new Error(`Unsupported file service provider: ${provider}`);
  }
  if (!instance) {
    instance = new S3FileService();
  }
  return instance;
}
