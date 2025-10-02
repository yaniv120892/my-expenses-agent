import { FileService, FileServiceProvider } from '../types/fileService';
import { FileServiceProviderImpl } from './fileService';

export class FileServiceFactory {
  static createFileService(provider: FileServiceProvider): FileService {
    return new FileServiceProviderImpl(provider);
  }
}
