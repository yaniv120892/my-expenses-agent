import * as XLSX from "xlsx";

export type ExcelWorkbook = XLSX.WorkBook;
export type ExcelSheet = XLSX.WorkSheet;
export type ExcelRange = XLSX.Range;

export interface ColumnMappings {
  date: number;
  description: number;
  amount: number;
}

export interface ExcelRowData {
  [index: number]: string | number | boolean | Date | null | undefined;
}

export interface ProcessedRow {
  date: string | number | Date | null;
  description: string | number | null;
  amount: string | number | null;
  rawData: ExcelRowData;
}

export interface AIStructureAnalysis {
  headerRow: number;
  dataStartRow: number;
  columnMappings: ColumnMappings;
  fileType: string;
  confidence: number;
  summary: string;
}

export interface AIMetadataExtraction {
  paymentMethod?: string;
  creditCardLastFour?: string;
  bankSourceType?: "BANK_CREDIT" | "NON_BANK_CREDIT" | "UNKNOWN";
  paymentMonth?: string;
  confidence: number;
}

export interface AITransactionExtraction {
  date: string;
  description: string;
  value: number;
  type: "EXPENSE" | "INCOME";
}

export interface CellReference {
  r: number;
  c: number;
}
