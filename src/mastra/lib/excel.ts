import * as XLSX from "xlsx";

export type ExcelRow = (string | number | boolean | null | undefined)[];

export interface ColumnMappings {
  date: number;
  description: number;
  amount: number;
}

const MAX_PREVIEW_ROWS = 25;
const MAX_PREVIEW_COLS = 10;

export function parseWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "buffer" });
}

export function getFirstSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  return workbook.Sheets[workbook.SheetNames[0]];
}

// Serializes the first rows/columns of a sheet as plain text for the
// structure-analysis and metadata prompts (same 25x10 window as before).
export function sheetToText(sheet: XLSX.WorkSheet, filename: string): string {
  const range = getSheetRange(sheet);
  let text = `File: ${filename}\n\n`;

  for (let row = range.s.r; row <= Math.min(range.e.r, MAX_PREVIEW_ROWS); row++) {
    const rowData = extractRowData(sheet, row, range);
    text += `Row ${row + 1}: ${rowData.join(" | ")}\n`;
  }

  return text;
}

function getSheetRange(sheet: XLSX.WorkSheet): XLSX.Range {
  if (!sheet["!ref"]) {
    return { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  }
  return XLSX.utils.decode_range(sheet["!ref"]);
}

function extractRowData(
  sheet: XLSX.WorkSheet,
  row: number,
  range: XLSX.Range
): string[] {
  const rowData: string[] = [];
  for (let col = range.s.c; col <= Math.min(range.e.c, MAX_PREVIEW_COLS); col++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = sheet[cellRef];
    rowData.push(cell ? String(cell.v || "") : "");
  }
  return rowData;
}

export function sheetRows(sheet: XLSX.WorkSheet): ExcelRow[] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
  }) as ExcelRow[];
}

export function isEmptyRow(row: ExcelRow): boolean {
  return !row || row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
}

export function chunkRows<T>(rows: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
}

export function getCellValue(row: ExcelRow, columnIndex: number): string {
  const value = row[columnIndex];
  return value !== null && value !== undefined ? String(value) : "";
}

// Formats a chunk of data rows for the transaction-extraction prompt. Row
// numbers are absolute indices into the full data-row array so the model can
// echo them back (sourceRow) and rawData can be attached to the right row.
export function formatChunkForAI(
  chunk: { row: ExcelRow; index: number }[],
  columnMappings: ColumnMappings
): string {
  return chunk
    .map(({ row, index }) => {
      const date = getCellValue(row, columnMappings.date);
      const description = getCellValue(row, columnMappings.description);
      const amount = getCellValue(row, columnMappings.amount);
      return `Row ${index + 1}: Date="${date}" | Description="${description}" | Amount="${amount}"`;
    })
    .join("\n");
}

export function rowToRawData(row: ExcelRow): Record<string, string | number> {
  const entries: [string, string | number][] = [];
  row.forEach((cell, i) => {
    if (cell !== null && cell !== undefined && cell !== "") {
      entries.push([
        String(i),
        typeof cell === "number" ? cell : String(cell),
      ]);
    }
  });
  return Object.fromEntries(entries);
}
