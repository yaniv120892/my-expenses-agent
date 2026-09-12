import * as XLSX from "xlsx";
import { ExtractedTransaction } from "../types";
import { ColumnMappings, ExcelRowData } from "../types/excelTypes";

/**
 * Reads transactions straight from the sheet's cells once the columns are
 * known. A model re-emitting the rows shortens or transliterates merchant
 * names and occasionally drops a row, and it does so differently on every
 * pass — the cells do not.
 */
export function parseTransactionRows(
  rows: ExcelRowData[],
  mappings: ColumnMappings
): ExtractedTransaction[] {
  const transactions: ExtractedTransaction[] = [];

  for (const row of rows) {
    const date = parseCellDate(row[mappings.date]);
    const description = parseCellText(row[mappings.description]);
    // A statement that bills in a different currency than it charges carries
    // both amounts; the billed one is what the account actually paid. A refund
    // may leave the billed cell empty and carry a negative charged amount.
    const amount =
      parseCellAmount(cellAt(row, mappings.chargedAmount)) ??
      parseCellAmount(row[mappings.amount]);

    if (date === null || description === "" || amount === null || amount === 0) {
      continue;
    }

    transactions.push({
      date,
      description,
      value: roundToCents(Math.abs(amount)),
      type: amount < 0 ? "INCOME" : "EXPENSE",
      rawData: {},
    });
  }

  return transactions;
}

/** DD/MM/YYYY from an Excel serial, a Date, or a day-first text date. */
export function parseCellDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? formatDate(parsed.d, parsed.m, parsed.y) : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }
  if (typeof value === "string") {
    return parseTextDate(value.trim());
  }
  return null;
}

/** A number from a numeric cell or from text such as "₪ 1,234.50" or "-37.06". */
export function parseCellAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (digits === "" || digits === "-" || digits === ".") {
    return null;
  }
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * The total a statement states for itself, when its title rows carry one
 * (Cal: "עסקאות לחיוב ב-10/08/2026: 3,083.91 ₪"). Null when no row does.
 */
export function findStatedTotal(titleRows: ExcelRowData[]): number | null {
  for (const row of titleRows) {
    for (const cell of Object.values(row)) {
      if (typeof cell !== "string") {
        continue;
      }
      const match = cell.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s*₪/);
      if (match) {
        return Number(match[1].replace(/,/g, ""));
      }
    }
  }
  return null;
}

function cellAt(
  row: ExcelRowData,
  columnIndex: number | null | undefined
): unknown {
  return columnIndex === null || columnIndex === undefined
    ? undefined
    : row[columnIndex];
}

function parseCellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

const DAY_FIRST_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function parseTextDate(text: string): string | null {
  const dayFirst = text.match(DAY_FIRST_DATE);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    return formatDate(Number(day), Number(month), fullYear);
  }
  const iso = text.match(ISO_DATE);
  if (iso) {
    const [, year, month, day] = iso;
    return formatDate(Number(day), Number(month), Number(year));
  }
  return null;
}

function formatDate(day: number, month: number, year: number): string | null {
  const isCalendarDate =
    day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990;
  if (!isCalendarDate) {
    return null;
  }
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
