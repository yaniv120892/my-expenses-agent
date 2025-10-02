export type FileServiceProvider = 's3' | 'gcs' | 'azure' | 'local';

export interface FileService {
  downloadFile(fileUrl: string): Promise<Buffer>;
  getProvider(): string;
}
