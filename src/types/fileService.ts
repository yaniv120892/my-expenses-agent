export interface FileServiceConfig {
  provider: 's3' | 'gcs' | 'azure' | 'local';
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface FileService {
  downloadFile(fileUrl: string): Promise<Buffer>;
  getProvider(): string;
}
