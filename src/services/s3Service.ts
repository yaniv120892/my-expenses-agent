import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { S3Config } from '../types';
import { logger } from '../utils/logger';

export class S3Service {
  private client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
    this.client = this.createS3Client();
  }

  async downloadFile(fileUrl: string): Promise<Buffer> {
    try {
      const key = this.extractKeyFromUrl(fileUrl);
      const command = this.createGetObjectCommand(key);
      const response = await this.client.send(command);
      
      if (!response.Body) {
        throw new Error('No file content received from S3');
      }

      return await this.streamToBuffer(response.Body);
    } catch (error) {
      logger.error('S3 download error:', error);
      throw new Error(`Failed to download file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createS3Client(): S3Client {
    return new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      }
    });
  }

  private extractKeyFromUrl(fileUrl: string): string {
    try {
      const url = new URL(fileUrl);
      return decodeURIComponent(url.pathname.slice(1));
    } catch (error) {
      throw new Error(`Invalid file URL format: ${fileUrl}`);
    }
  }

  private createGetObjectCommand(key: string): GetObjectCommand {
    return new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: key
    });
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
