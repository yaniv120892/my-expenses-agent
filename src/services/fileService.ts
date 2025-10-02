import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { FileService, FileServiceConfig } from '../types/fileService';
import { logger } from '../utils/logger';

export class FileServiceProvider implements FileService {
  private client: S3Client;
  private config: FileServiceConfig;
  private provider: string;

  constructor(config: FileServiceConfig) {
    this.config = config;
    this.provider = config.provider;
    
    if (config.provider === 's3') {
      this.client = this.createS3Client();
    } else {
      throw new Error(`Unsupported file service provider: ${config.provider}`);
    }
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    try {
      switch (this.provider) {
        case 's3':
          return await this.downloadFromS3(fileUrl);
        case 'gcs':
          return await this.downloadFromGCS(fileUrl);
        case 'azure':
          return await this.downloadFromAzure(fileUrl);
        case 'local':
          return await this.downloadFromLocal(fileUrl);
        default:
          throw new Error(`Unsupported provider: ${this.provider}`);
      }
    } catch (error) {
      logger.error('File download error:', error);
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getProvider(): string {
    return this.provider;
  }

  private createS3Client(): S3Client {
    if (!this.config.region || !this.config.accessKeyId || !this.config.secretAccessKey) {
      throw new Error('S3 configuration is incomplete');
    }

    return new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      }
    });
  }

  private async downloadFromS3(fileUrl: string): Promise<Buffer> {
    const key = this.extractKeyFromUrl(fileUrl);
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key
    });

    const response = await this.client.send(command);
    
    if (!response.Body) {
      throw new Error('No file content received from S3');
    }

    return await this.streamToBuffer(response.Body);
  }

  private async downloadFromGCS(fileUrl: string): Promise<Buffer> {
    throw new Error('GCS provider not implemented yet');
  }

  private async downloadFromAzure(fileUrl: string): Promise<Buffer> {
    throw new Error('Azure provider not implemented yet');
  }

  private async downloadFromLocal(fileUrl: string): Promise<Buffer> {
    throw new Error('Local provider not implemented yet');
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
    const stream = body as { [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array> };
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }
}
