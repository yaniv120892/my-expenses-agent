import { FileService, FileServiceConfig } from '../types/fileService';
import { FileServiceProvider } from './fileService';

export class FileServiceFactory {
  static createFileService(config: FileServiceConfig): FileService {
    return new FileServiceProvider(config);
  }
}
