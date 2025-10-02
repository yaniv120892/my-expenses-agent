export * from './extraction';
export * from './validation';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message: string;
  error?: string;
  requestId: string;
  timestamp: string;
}
