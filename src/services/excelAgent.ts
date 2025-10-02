import * as XLSX from 'xlsx';
import { AIProvider } from './aiProvider';
import { S3Service } from './s3Service';
import { 
  ExtractionResult, 
  ExtractedTransaction, 
  ExtractedMetadata, 
  StructureAnalysis,
  ProcessingContext
} from '../types';
import { logger } from '../utils/logger';
import { 
  ExtractedTransactionSchema,
  ExtractedMetadataSchema,
  StructureAnalysisSchema
} from '../types/validation';
import {
  ExcelWorkbook,
  ExcelSheet,
  ExcelRange,
  ExcelRowData,
  ColumnMappings,
  AIStructureAnalysis,
  AIMetadataExtraction,
  AITransactionExtraction
} from '../types/excelTypes';

export class ExcelExtractionAgent {
  private aiProvider: AIProvider;
  private s3Service: S3Service;

  constructor(aiProvider: AIProvider, s3Service: S3Service) {
    this.aiProvider = aiProvider;
    this.s3Service = s3Service;
  }

  async extractData(context: ProcessingContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    const processingNotes: string[] = [];

    try {
      logger.info('Starting Excel extraction', { 
        requestId: context.requestId, 
        filename: context.filename 
      });

      const workbook = await this.downloadAndParseFile(context.fileUrl);
      processingNotes.push('File downloaded and parsed successfully');

      const structure = await this.analyzeStructure(workbook, context);
      processingNotes.push(`Structure analysis completed: ${structure.summary}`);

      const metadata = await this.extractMetadata(workbook, context, structure);
      processingNotes.push(`Metadata extracted with confidence: ${metadata.confidence}`);

      const transactions = await this.extractTransactions(workbook, context, structure, metadata);
      processingNotes.push(`Extracted ${transactions.length} transactions`);

      const validatedResult = await this.validateAndCleanData(
        transactions, 
        metadata, 
        structure, 
        context
      );

      const processingTime = Date.now() - startTime;

      logger.info('Excel extraction completed', {
        requestId: context.requestId,
        transactionsCount: validatedResult.transactions.length,
        processingTime,
        confidence: metadata.confidence
      });

      return {
        ...validatedResult,
        processingTime,
        processingNotes: [...processingNotes, ...validatedResult.processingNotes]
      };

    } catch (error) {
      logger.error('Excel extraction failed', {
        requestId: context.requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async downloadAndParseFile(fileUrl: string): Promise<ExcelWorkbook> {
    const fileBuffer = await this.s3Service.downloadFile(fileUrl);
    return XLSX.read(fileBuffer, { type: 'buffer' }) as ExcelWorkbook;
  }

  private async analyzeStructure(workbook: ExcelWorkbook, context: ProcessingContext): Promise<StructureAnalysis> {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const textData = this.convertSheetToText(firstSheet, context.filename);

    const prompt = this.buildStructureAnalysisPrompt(textData);
    const systemPrompt = this.getStructureAnalysisSystemPrompt();

    const aiResult = await this.aiProvider.extractStructuredData<AIStructureAnalysis>(
      prompt,
      StructureAnalysisSchema,
      systemPrompt
    );

    return this.convertAIStructureToStructure(aiResult);
  }

  private async extractMetadata(workbook: ExcelWorkbook, context: ProcessingContext, structure: StructureAnalysis): Promise<ExtractedMetadata> {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const textData = this.convertSheetToText(firstSheet, context.filename);

    const prompt = this.buildMetadataExtractionPrompt(textData);
    const systemPrompt = this.getMetadataExtractionSystemPrompt();

    const aiResult = await this.aiProvider.extractStructuredData<AIMetadataExtraction>(
      prompt,
      ExtractedMetadataSchema,
      systemPrompt
    );

    return this.convertAIMetadataToMetadata(aiResult);
  }

  private async extractTransactions(workbook: ExcelWorkbook, context: ProcessingContext, structure: StructureAnalysis, metadata: ExtractedMetadata): Promise<ExtractedTransaction[]> {
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true }) as ExcelRowData[];
    
    const dataRows = rows.slice(structure.dataStartRow);
    const formattedData = this.formatRowsForAI(dataRows, structure.columnMappings);

    const prompt = this.buildTransactionExtractionPrompt(formattedData);
    const systemPrompt = this.getTransactionExtractionSystemPrompt();

    const aiResult = await this.aiProvider.extractStructuredData<AITransactionExtraction[]>(
      prompt,
      ExtractedTransactionSchema.array(),
      systemPrompt
    );

    return this.convertAITransactionsToTransactions(aiResult);
  }

  private async validateAndCleanData(transactions: ExtractedTransaction[], metadata: ExtractedMetadata, structure: StructureAnalysis, context: ProcessingContext): Promise<Omit<ExtractionResult, 'processingTime'>> {
    const processingNotes: string[] = [];

    const validTransactions = this.filterValidTransactions(transactions);
    processingNotes.push(`Validated ${validTransactions.length} transactions (removed ${transactions.length - validTransactions.length} invalid)`);

    const cleanedTransactions = this.cleanTransactionDescriptions(validTransactions);

    if (metadata.confidence < context.options.confidenceThreshold) {
      processingNotes.push(`Warning: Low confidence score (${metadata.confidence}) below threshold (${context.options.confidenceThreshold})`);
    }

    return {
      transactions: cleanedTransactions,
      metadata,
      structure,
      processingNotes
    };
  }

  private convertSheetToText(sheet: ExcelSheet, filename: string): string {
    const range = this.getSheetRange(sheet);
    let text = `File: ${filename}\n\n`;
    
    for (let row = range.s.r; row <= Math.min(range.e.r, 25); row++) {
      const rowData = this.extractRowData(sheet, row, range);
      text += `Row ${row + 1}: ${rowData.join(' | ')}\n`;
    }
    
    return text;
  }

  private getSheetRange(sheet: ExcelSheet): ExcelRange {
    if (!sheet['!ref']) {
      return { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    }
    return XLSX.utils.decode_range(sheet['!ref']);
  }

  private extractRowData(sheet: ExcelSheet, row: number, range: ExcelRange): string[] {
    const rowData: string[] = [];
    for (let col = range.s.c; col <= Math.min(range.e.c, 10); col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[cellRef];
      rowData.push(cell ? String(cell.v || '') : '');
    }
    return rowData;
  }

  private formatRowsForAI(rows: ExcelRowData[], columnMappings: ColumnMappings): string {
    return rows.slice(0, 100).map((row, index) => {
      const date = this.getCellValue(row, columnMappings.date);
      const description = this.getCellValue(row, columnMappings.description);
      const amount = this.getCellValue(row, columnMappings.amount);
      return `Row ${index + 1}: Date="${date}" | Description="${description}" | Amount="${amount}"`;
    }).join('\n');
  }

  private getCellValue(row: ExcelRowData, columnIndex: number): string {
    const value = row[columnIndex];
    return value !== null && value !== undefined ? String(value) : '';
  }

  private filterValidTransactions(transactions: ExtractedTransaction[]): ExtractedTransaction[] {
    return transactions.filter(transaction => this.isValidTransaction(transaction));
  }

  private cleanTransactionDescriptions(transactions: ExtractedTransaction[]): ExtractedTransaction[] {
    return transactions.map(transaction => ({
      ...transaction,
      description: this.cleanDescription(transaction.description)
    }));
  }

  private isValidTransaction(transaction: ExtractedTransaction): boolean {
    try {
      return !!(
        transaction.date &&
        transaction.description &&
        transaction.description.trim() &&
        transaction.value &&
        transaction.value > 0 &&
        transaction.type &&
        ['EXPENSE', 'INCOME'].includes(transaction.type)
      );
    } catch {
      return false;
    }
  }

  private cleanDescription(description: string): string {
    if (!description) return '';
    
    return description
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\u0590-\u05FF]/g, '')
      .substring(0, 200);
  }

  private convertAIStructureToStructure(aiResult: AIStructureAnalysis): StructureAnalysis {
    return {
      headerRow: aiResult.headerRow,
      dataStartRow: aiResult.dataStartRow,
      columnMappings: aiResult.columnMappings,
      fileType: aiResult.fileType,
      confidence: aiResult.confidence,
      summary: aiResult.summary
    };
  }

  private convertAIMetadataToMetadata(aiResult: AIMetadataExtraction): ExtractedMetadata {
    return {
      paymentMethod: aiResult.paymentMethod,
      creditCardLastFour: aiResult.creditCardLastFour,
      bankSourceType: aiResult.bankSourceType,
      paymentMonth: aiResult.paymentMonth,
      confidence: aiResult.confidence
    };
  }

  private convertAITransactionsToTransactions(aiResult: AITransactionExtraction[]): ExtractedTransaction[] {
    return aiResult.map(transaction => ({
      date: transaction.date,
      description: transaction.description,
      value: transaction.value,
      type: transaction.type,
      rawData: {}
    }));
  }

  private buildStructureAnalysisPrompt(textData: string): string {
    return `
Analyze this Excel file structure and identify:

1. Header row location (0-based index)
2. Data start row (0-based index, first row with actual transaction data)
3. Column mappings for: date, description, amount (0-based column indices)
4. File format type (American Express, Visa, Mastercard, CAL, Bank statement, etc.)
5. Any special formatting or patterns

Excel Data:
${textData}
`;
  }

  private getStructureAnalysisSystemPrompt(): string {
    return 'You are an expert Excel analyst specializing in financial documents. Always respond with valid JSON only. Be precise with column indices and row numbers.';
  }

  private buildMetadataExtractionPrompt(textData: string): string {
    return `
Extract metadata from this Excel file:

1. Payment method (American Express, Visa, Mastercard, CAL, etc.)
2. Credit card last 4 digits (if available)
3. Bank source type (BANK_CREDIT for bank statements, NON_BANK_CREDIT for credit card statements)
4. Payment month (MM/YYYY format)
5. Confidence level (0-1)

Excel Data:
${textData}
`;
  }

  private getMetadataExtractionSystemPrompt(): string {
    return 'You are an expert at extracting financial metadata from Excel files. Always respond with valid JSON only. Be conservative with confidence scores.';
  }

  private buildTransactionExtractionPrompt(formattedData: string): string {
    return `
Extract all transactions from this data. Each transaction should have:
- date (DD/MM/YYYY format)
- description (clean business name, remove extra characters)
- value (positive number, expenses are positive)
- type (EXPENSE or INCOME)

Data:
${formattedData}
`;
  }

  private getTransactionExtractionSystemPrompt(): string {
    return 'You are an expert at extracting financial transactions from Excel data. Always respond with valid JSON array only. Clean descriptions and normalize data.';
  }
}
