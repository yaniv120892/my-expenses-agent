import * as XLSX from "xlsx";
import { ExtractedTransaction } from "../types";
import { ColumnMappings, ExcelRowData, ExcelSheet } from "../types/excelTypes";
import { CurrencyDetection, detectCurrency } from "./currency";

// The currency an unlabelled amount on an Israeli issuer's statement is in.
const STATEMENT_CURRENCY = "ILS";

/**
 * Reads a sheet's transactions from its cells once the columns are known.
 * The displayed rows come back too: a numeric cell's currency lives only in
 * its number format, so the symbols are read from them, and the model
 * fallback reads them when no row parses.
 */
export function readSheetTransactions(
  sheet: ExcelSheet,
  mappings: ColumnMappings,
  dataStartRow: number
): { transactions: ExtractedTransaction[]; displayedRows: ExcelRowData[] } {
  const cellRows = sheetRows(sheet, true).slice(dataStartRow);
  const displayedRows = sheetRows(sheet, false).slice(dataStartRow);
  return {
    transactions: parseTransactionRows(cellRows, mappings, displayedRows),
    displayedRows,
  };
}

export function sheetRows(sheet: ExcelSheet, raw: boolean): ExcelRowData[] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw }) as ExcelRowData[];
}

/**
 * A model re-emitting the rows shortens or transliterates merchant names and
 * occasionally drops a row, and it does so differently on every pass — the
 * cells do not.
 */
export function parseTransactionRows(
  rows: ExcelRowData[],
  mappings: ColumnMappings,
  textRows: ExcelRowData[] = rows
): ExtractedTransaction[] {
  const parsedRows = rows.flatMap((row, index) => {
    const parsed = parseRow(row, textRows[index] ?? row, mappings);
    return parsed === null ? [] : [parsed];
  });
  const statementBillsForeignCharges =
    hasBilledColumn(mappings) && parsedRows.some(namesForeignCurrency);

  return parsedRows.map((parsed) =>
    toExtractedTransaction(parsed, statementBillsForeignCharges)
  );
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

type ParsedRow = {
  date: string;
  description: string;
  amount: number;
  originalAmount: number | null;
  chargedAmount: number | null;
  originalCurrency: CurrencyDetection;
  chargedCurrency: CurrencyDetection;
};

function parseRow(
  row: ExcelRowData,
  textRow: ExcelRowData,
  mappings: ColumnMappings
): ParsedRow | null {
  const date = parseCellDate(row[mappings.date]);
  const description = parseCellText(row[mappings.description]);
  const originalAmount = parseCellAmount(row[mappings.amount]);
  const chargedAmount = parseCellAmount(cellAt(row, mappings.chargedAmount));
  // A statement that bills in a different currency than it charges carries
  // both amounts; the billed one is what the account actually paid. A refund
  // may leave the billed cell empty and carry a negative charged amount.
  const amount = chargedAmount ?? originalAmount;

  if (date === null || description === "" || amount === null || amount === 0) {
    return null;
  }

  return {
    date,
    description,
    amount,
    originalAmount,
    chargedAmount,
    originalCurrency: detectCellCurrency(textRow, mappings.currency, mappings.amount),
    chargedCurrency: detectCellCurrency(
      textRow,
      mappings.chargedCurrency,
      mappings.chargedAmount
    ),
  };
}

function toExtractedTransaction(
  parsed: ParsedRow,
  statementBillsForeignCharges: boolean
): ExtractedTransaction {
  const transaction: ExtractedTransaction = {
    date: parsed.date,
    description: parsed.description,
    value: roundToCents(Math.abs(parsed.amount)),
    type: parsed.amount < 0 ? "INCOME" : "EXPENSE",
    rawData: {},
  };

  if (parsed.originalAmount !== null) {
    transaction.originalAmount = roundToCents(Math.abs(parsed.originalAmount));
  }
  if (parsed.originalCurrency.kind === "code") {
    transaction.originalCurrency = parsed.originalCurrency.code;
  }
  if (parsed.chargedAmount !== null) {
    transaction.chargedAmount = roundToCents(Math.abs(parsed.chargedAmount));
  }
  if (parsed.chargedCurrency.kind === "code") {
    transaction.chargedCurrency = parsed.chargedCurrency.code;
  }
  if (isCurrencyAmbiguous(parsed, statementBillsForeignCharges)) {
    transaction.currencyAmbiguous = true;
  }
  return transaction;
}

// An instalment's original and billed amounts differ too, both in ILS, so
// only a named currency marks a row foreign.
function namesForeignCurrency(parsed: ParsedRow): boolean {
  return (
    parsed.originalCurrency.kind === "code" &&
    parsed.originalCurrency.code !== STATEMENT_CURRENCY
  );
}

function hasBilledColumn(mappings: ColumnMappings): boolean {
  return mappings.chargedAmount !== null && mappings.chargedAmount !== undefined;
}


/**
 * Without a billed amount, the original amount is only safe to treat as the
 * statement's own currency when nothing on the statement says otherwise: on
 * a statement that bills foreign charges, an unlabelled original with an
 * empty billed cell could be in either currency.
 */
function isCurrencyAmbiguous(
  parsed: ParsedRow,
  statementBillsForeignCharges: boolean
): boolean {
  const markerIsAmbiguous =
    parsed.originalCurrency.kind === "ambiguous" ||
    parsed.chargedCurrency.kind === "ambiguous";
  const unlabelledOriginalWithoutBilled =
    parsed.chargedAmount === null &&
    parsed.originalCurrency.kind === "none" &&
    statementBillsForeignCharges;
  return markerIsAmbiguous || unlabelledOriginalWithoutBilled;
}

function detectCellCurrency(
  textRow: ExcelRowData,
  currencyColumn: number | null | undefined,
  amountColumn: number | null | undefined
): CurrencyDetection {
  const fromCurrencyColumn = detectCurrency(
    parseCellText(cellAt(textRow, currencyColumn))
  );
  if (fromCurrencyColumn.kind !== "none") {
    return fromCurrencyColumn;
  }
  return detectCurrency(parseCellText(cellAt(textRow, amountColumn)));
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
